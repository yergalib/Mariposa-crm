import "dotenv/config";
import { db } from "../lib/db";

async function main() {
  const triggers = await db.$queryRaw<Array<{ name: string; enabled: string }>>`
    SELECT tgname AS name, tgenabled::text AS enabled
    FROM pg_trigger
    WHERE tgname IN (
      'financial_transactions_immutable_update',
      'audit_logs_immutable_update',
      'bulk_physical_resolutions_context',
      'bulk_physical_resolution_lines_context',
      'bulk_physical_resolutions_totals',
      'bulk_physical_resolution_lines_totals',
      'capacity_allocations_bulk_return_projection',
      'capacity_allocations_bulk_maintenance',
      'capacity_allocations_bulk_maintenance_projection',
      'bulk_maintenance_events_context',
      'bulk_maintenance_events_projection',
      'inventory_movements_bulk_link',
      'bulk_physical_resolutions_immutable',
      'bulk_physical_resolution_lines_immutable',
      'bulk_maintenance_events_immutable'
    ) ORDER BY tgname
  `;
  const [security] = await db.$queryRaw<Array<{
    tables: number;
    rls: number;
    anon: number;
    authenticated: number;
    policies: number;
    fixtures: number;
    affectedFixtures: number;
    malformed: number;
  }>>`
    SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS tables,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) AS rls,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') AS anon,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated') AS authenticated,
      (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND roles && ARRAY['anon','authenticated','public']::name[]) AS policies,
      (SELECT count(*)::int FROM organizations WHERE slug LIKE 'bulk-1-%') AS fixtures,
      (SELECT count(*)::int FROM organizations WHERE slug LIKE 'bulk-1-%' OR slug LIKE 'stage-7a-%' OR slug LIKE 'availability-test-%') AS "affectedFixtures",
      (SELECT count(*)::int
       FROM bulk_physical_resolutions r
       JOIN capacity_allocations a ON a.id=r.capacity_allocation_id
       LEFT JOIN LATERAL (SELECT COALESCE(sum(l.quantity),0)::int quantity FROM bulk_physical_resolution_lines l WHERE l.resolution_id=r.id) lines ON true
       WHERE lines.quantity<>r.total_quantity
          OR r.organization_id<>a.organization_id OR r.branch_id<>a.branch_id
          OR r.order_id IS DISTINCT FROM a.order_id OR r.order_item_id IS DISTINCT FROM a.order_item_id
          OR r.product_variant_id<>a.product_variant_id) AS malformed
  `;
  if (triggers.length !== 15 || triggers.some((trigger) => trigger.enabled !== "O") || !security
    || security.tables !== security.rls || security.anon || security.authenticated || security.policies
    || security.fixtures || security.affectedFixtures || security.malformed) {
    throw new Error(JSON.stringify({ triggers, security }));
  }
  console.log("BULK-1 security posture", { triggers, security });
}

main().finally(() => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
