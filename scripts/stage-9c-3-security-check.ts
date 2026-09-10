import "dotenv/config";
import { db } from "../lib/db";

async function main(){
 const triggers=await db.$queryRaw<Array<{name:string;enabled:string}>>`SELECT tgname name,tgenabled::text enabled FROM pg_trigger WHERE tgname IN ('financial_transactions_immutable_update','audit_logs_immutable_update','purchase_receipts_immutable','purchase_receipt_lines_immutable','bulk_acquisition_layers_immutable','purchase_items_locked_delete') ORDER BY tgname`;
 const security=await db.$queryRaw<Array<{tables:number;rls:number;anon:number;authenticated:number;policies:number;fixtures:number}>>`SELECT (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) tables,(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) rls,(SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') anon,(SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated') authenticated,(SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND roles && ARRAY['anon','authenticated','public']::name[]) policies,(SELECT count(*)::int FROM organizations WHERE slug LIKE 'stage-9c-3-%') fixtures`;
 if(triggers.length!==6||triggers.some(trigger=>trigger.enabled!=="O")||security[0]!.tables!==50||security[0]!.rls!==50||security[0]!.anon!==0||security[0]!.authenticated!==0||security[0]!.policies!==0||security[0]!.fixtures!==0)throw new Error(`Security posture mismatch: ${JSON.stringify({triggers,security:security[0]})}`);
 console.log("Stage 9C-3 security posture",{triggers,security:security[0]});
}
main().finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});
