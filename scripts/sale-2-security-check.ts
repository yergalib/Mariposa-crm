import "dotenv/config";
import { db } from "../lib/db";

async function main() {
  const [security] = await db.$queryRaw<Array<{
    tables: number;
    rls: number;
    anon: number;
    authenticated: number;
    policies: number;
  }>>`
    SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS tables,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) AS rls,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') AS anon,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated') AS authenticated,
      (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND roles && ARRAY['anon','authenticated','public']::name[]) AS policies
  `;
  const triggers = await db.$queryRaw<Array<{ name: string; enabled: string }>>`
    SELECT t.tgname AS name, t.tgenabled::text AS enabled
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND t.tgname IN (
      'sale_inventory_commitments_context',
      'sale_inventory_commitments_immutable',
      'inventory_movements_sale_link',
      'sale_commitments_fulfillment_projection',
      'orders_confirmed_sale_commercial_guard',
      'order_items_confirmed_sale_commercial_guard',
      'orders_completed_sale_fulfillment',
      'inventory_movements_sale_delete_guard'
    )
    ORDER BY t.tgname
  `;
  const [migrations, sale1Fixtures, sale2Fixtures] = await Promise.all([
    db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    db.organization.count({ where: { slug: { startsWith: "sale-1-" } } }),
    db.organization.count({ where: { slug: { startsWith: "sale-2-" } } }),
  ]);

  if (!security || security.tables !== 57 || security.rls !== 57 || security.anon !== 0 || security.authenticated !== 0 || security.policies !== 0) {
    throw new Error(`Unexpected security posture: ${JSON.stringify(security)}`);
  }
  if (triggers.length !== 8 || triggers.some((trigger) => trigger.enabled !== "O")) {
    throw new Error(`Unexpected SALE trigger state: ${JSON.stringify(triggers)}`);
  }
  if (migrations[0]?.count !== 40 || sale1Fixtures !== 0 || sale2Fixtures !== 0) {
    throw new Error(`Unexpected migration/fixture state: ${JSON.stringify({ migrations: migrations[0]?.count, sale1Fixtures, sale2Fixtures })}`);
  }

  console.log("SALE-2 security: PASS", {
    ...security,
    triggers: triggers.length,
    migrations: migrations[0].count,
    sale1Fixtures,
    sale2Fixtures,
  });
}

main().finally(() => db.$disconnect()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
