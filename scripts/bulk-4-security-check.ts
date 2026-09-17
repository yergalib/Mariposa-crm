import "dotenv/config";
import { db } from "../lib/db";

async function main() {
  const triggerNames = [
    "financial_transactions_immutable_update", "audit_logs_immutable_update",
    "bulk_physical_resolutions_context", "bulk_physical_resolution_lines_context",
    "bulk_physical_resolutions_totals", "bulk_physical_resolution_lines_totals",
    "capacity_allocations_bulk_return_projection", "capacity_allocations_bulk_maintenance",
    "capacity_allocations_bulk_maintenance_projection", "bulk_maintenance_events_context",
    "bulk_maintenance_events_projection", "inventory_movements_bulk_link",
    "bulk_physical_resolutions_immutable", "bulk_physical_resolution_lines_immutable",
    "bulk_maintenance_events_immutable", "bulk_loss_lines_movement_integrity",
    "bulk_writeoff_events_movement_integrity", "products_tracking_mode_integrity",
    "product_variants_scannable_code_integrity", "product_instances_scannable_code_integrity"
  ];
  const triggers = await db.$queryRawUnsafe<Array<{name:string;enabled:string}>>(`SELECT tgname AS name,tgenabled::text AS enabled FROM pg_trigger WHERE tgname IN (${triggerNames.map((_,i)=>`$${i+1}`).join(",")}) ORDER BY tgname`, ...triggerNames);
  const [posture] = await db.$queryRaw<Array<{tables:number;rls:number;anon:number;authenticated:number;policies:number;fixtures:number;migrations:number;scanFunction:boolean;modeFunction:boolean;collisions:number}>>`
    SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS tables,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) AS rls,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') AS anon,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated') AS authenticated,
      (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND roles && ARRAY['anon','authenticated','public']::name[]) AS policies,
      (SELECT count(*)::int FROM organizations WHERE slug LIKE 'bulk-1-%' OR slug LIKE 'bulk-2-%' OR slug LIKE 'bulk-3-%' OR slug LIKE 'bulk-4-%' OR slug LIKE 'availability-test-%' OR slug LIKE 'stage-7b-%' OR slug LIKE 'stage-8a-%' OR slug LIKE 'stage-8b-%' OR slug LIKE 'stage-9b-2c-%' OR slug LIKE 'stage-9c-3-%' OR slug LIKE 'stage-9d-%') AS fixtures,
      (SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS migrations,
      position('another scannable code' in pg_get_functiondef('public.enforce_scannable_code_integrity()'::regprocedure))>0 AS "scanFunction",
      position('operational history' in pg_get_functiondef('public.prevent_product_tracking_mode_change()'::regprocedure))>0 AS "modeFunction",
      (SELECT count(*)::int FROM product_variants v JOIN product_instances i ON i.organization_id=v.organization_id AND upper(btrim(i.barcode))=upper(btrim(v.sku))) AS collisions
  `;
  if (triggers.length!==triggerNames.length || triggers.some(row=>row.enabled!=="O") || !posture || posture.tables!==posture.rls || posture.anon || posture.authenticated || posture.policies || posture.fixtures || posture.migrations!==33 || !posture.scanFunction || !posture.modeFunction || posture.collisions) throw new Error(JSON.stringify({triggers,posture}));
  console.log("BULK-4 security posture", { triggerCount: triggers.length, posture });
}
main().finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1});
