import "dotenv/config";
import { db } from "../lib/db";

async function main(){
  const [posture]=await db.$queryRaw<Array<{tables:number;rls:number;anon:number;authenticated:number;policies:number;migrations:number;fixtures:number}>>`
    SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) tables,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) rls,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') anon,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated') authenticated,
      (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND roles && ARRAY['anon','authenticated','public']::name[]) policies,
      (SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) migrations,
      (SELECT count(*)::int FROM organizations WHERE slug LIKE 'catalog-pilot-1-%' OR slug LIKE 'organization-switch-%' OR slug LIKE 'orders-test-%' OR slug LIKE 'availability-test-%' OR slug LIKE 'bulk-1-%' OR slug LIKE 'bulk-2-%' OR slug LIKE 'bulk-3-%' OR slug LIKE 'bulk-4-%' OR slug LIKE 'sale-1-%' OR slug LIKE 'sale-2-%' OR slug LIKE 'stage-8a-%' OR slug LIKE 'stage-8b-%' OR slug LIKE 'stage-9c-3-%') fixtures
  `;
  const triggers=await db.$queryRaw<Array<{name:string;enabled:string}>>`
    SELECT tgname name,tgenabled::text enabled FROM pg_trigger WHERE tgname IN ('product_executions_tenant_integrity','product_variants_execution_integrity','product_images_execution_integrity') ORDER BY tgname
  `;
  if(!posture||posture.tables!==posture.rls||posture.anon||posture.authenticated||posture.policies||posture.migrations!==40||posture.fixtures||triggers.length!==3||triggers.some(t=>t.enabled!=="O")) throw new Error(JSON.stringify({posture,triggers}));
  console.log("CATALOG PILOT-1 security",{posture,triggers});
}
main().finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1});
