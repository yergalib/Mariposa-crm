import "dotenv/config";
import { db } from "../lib/db";

async function main() {
  const triggers = await db.$queryRaw<Array<{ name: string; enabled: string }>>`
    SELECT tgname AS name, tgenabled::text AS enabled
    FROM pg_trigger
    WHERE tgname IN (
      'financial_transactions_immutable_update',
      'audit_logs_immutable_update',
      'purchase_receipts_immutable',
      'purchase_receipt_lines_immutable',
      'bulk_acquisition_layers_immutable',
      'purchase_items_locked_delete'
    )
    ORDER BY tgname`;
  const [security] = await db.$queryRaw<Array<{ tables: number; rls: number; anon: number; authenticated: number; policies: number; fixtures: number; settlementFixtures: number }>>`
    SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS tables,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) AS rls,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') AS anon,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated') AS authenticated,
      (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND roles && ARRAY['anon','authenticated','public']::name[]) AS policies,
      (SELECT count(*)::int FROM organizations WHERE slug LIKE 'stage-9d-%') AS fixtures,
      (SELECT count(*)::int FROM organizations WHERE slug LIKE 'stage-9b-2c-%') AS "settlementFixtures"`;
  if (triggers.length !== 6 || triggers.some((trigger) => trigger.enabled !== "O") || !security || security.tables !== 50 || security.rls !== 50 || security.anon !== 0 || security.authenticated !== 0 || security.policies !== 0 || security.fixtures !== 0 || security.settlementFixtures !== 0) throw new Error(`Stage 9D security posture mismatch: ${JSON.stringify({ triggers, security })}`);
  console.log("Stage 9D security posture", { triggers, security });
}

main().finally(() => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
