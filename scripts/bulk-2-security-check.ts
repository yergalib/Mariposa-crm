import "dotenv/config";
import { db } from "../lib/db";

async function main() {
  const triggers = await db.$queryRaw<Array<{ name: string; enabled: string }>>`
    SELECT tgname AS name, tgenabled::text AS enabled
    FROM pg_trigger
    WHERE tgname IN (
      'financial_transactions_immutable_update','audit_logs_immutable_update',
      'bulk_physical_resolutions_context','bulk_physical_resolution_lines_context',
      'bulk_physical_resolutions_totals','bulk_physical_resolution_lines_totals',
      'capacity_allocations_bulk_return_projection','capacity_allocations_bulk_maintenance',
      'capacity_allocations_bulk_maintenance_projection','bulk_maintenance_events_context',
      'bulk_maintenance_events_projection','inventory_movements_bulk_link',
      'bulk_physical_resolutions_immutable','bulk_physical_resolution_lines_immutable',
      'bulk_maintenance_events_immutable'
    ) ORDER BY tgname
  `;
  const [posture] = await db.$queryRaw<Array<{
    tables: number; rls: number; anon: number; authenticated: number; policies: number;
    fixtures: number; affectedFixtures: number; migrations: number; parentColumn: number; transitionIndex: number;
    allocationFunction: boolean; projectionFunction: boolean; eventFunction: boolean;
  }>>`
    SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS tables,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) AS rls,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') AS anon,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated') AS authenticated,
      (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND roles && ARRAY['anon','authenticated','public']::name[]) AS policies,
      (SELECT count(*)::int FROM organizations WHERE slug LIKE 'bulk-2-%') AS fixtures,
      (SELECT count(*)::int FROM organizations WHERE slug LIKE 'bulk-1-%' OR slug LIKE 'bulk-2-%' OR slug LIKE 'availability-test-%' OR slug LIKE 'stage-8a-%' OR slug LIKE 'stage-8b-%') AS "affectedFixtures",
      (SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS migrations,
      (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='capacity_allocations' AND column_name='parent_maintenance_allocation_id') AS "parentColumn",
      (SELECT count(*)::int FROM pg_indexes WHERE schemaname='public' AND indexname='bulk_maintenance_events_related_allocation_id_key') AS "transitionIndex",
      position('parent_maintenance_allocation_id' in pg_get_functiondef('public.enforce_bulk_maintenance_allocation()'::regprocedure))>0 AS "allocationFunction",
      position('child bulk maintenance requires immutable transition event' in pg_get_functiondef('public.check_bulk_maintenance_projection()'::regprocedure))>0 AS "projectionFunction",
      position('related allocation is only valid for maintenance transition' in pg_get_functiondef('public.enforce_bulk_maintenance_event()'::regprocedure))>0 AS "eventFunction"
  `;
  if (triggers.length !== 15 || triggers.some((trigger) => trigger.enabled !== "O") || !posture
    || posture.tables !== posture.rls || posture.anon || posture.authenticated || posture.policies
    || posture.fixtures || posture.affectedFixtures || posture.migrations !== 28 || posture.parentColumn !== 1 || posture.transitionIndex !== 1
    || !posture.allocationFunction || !posture.projectionFunction || !posture.eventFunction) {
    throw new Error(JSON.stringify({ triggers, posture }));
  }
  console.log("BULK-2 security posture", { triggers, posture });
}

main().finally(() => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
