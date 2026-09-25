import "dotenv/config";
import { db } from "../lib/db";

const passed:string[]=[];const pass=(name:string,value:unknown)=>{if(!value)throw new Error(`FAIL ${name}`);passed.push(name)};
async function main(){
 const [posture]=await db.$queryRaw<Array<{tables:number;rls:number;anon:number;authenticated:number;policies:number;migrations:number;batches:number;references:number}>>`SELECT
 (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) tables,
 (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) rls,
 (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') anon,
 (SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated') authenticated,
 (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND roles && ARRAY['anon','authenticated','public']::name[]) policies,
 (SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) migrations,
 (SELECT count(*)::int FROM catalog_import_batches) batches,
 (SELECT count(*)::int FROM catalog_source_references) references`;
 const triggers=await db.$queryRaw<Array<{tgname:string;enabled:string}>>`SELECT tgname,tgenabled::text enabled FROM pg_trigger WHERE tgname IN ('catalog_import_batches_integrity','catalog_import_batches_immutable_delete','catalog_source_references_integrity','catalog_source_references_immutable_delete') ORDER BY tgname`;
 const constraints=await db.$queryRaw<Array<{name:string}>>`SELECT conname name FROM pg_constraint WHERE conname IN ('catalog_import_batches_counts_check','catalog_import_batches_hashes_check','catalog_import_batches_terminal_time_check','catalog_source_references_quantity_check','catalog_source_references_batch_org_fkey')`;
 pass("all public tables retain RLS",posture.tables===posture.rls);pass("anon privileges zero",posture.anon===0);pass("authenticated privileges zero",posture.authenticated===0);pass("granting policies zero",posture.policies===0);pass("migration count 40",posture.migrations===40);pass("dry-run created no batches",posture.batches===0);pass("dry-run created no references",posture.references===0);pass("four provenance triggers enabled",triggers.length===4&&triggers.every(t=>t.enabled==="O"));pass("provenance constraints present",constraints.length===5);
 console.log(`CATALOG FINAL-2 security: ${passed.length}/${passed.length} passed`,{posture,triggers,constraints});
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
