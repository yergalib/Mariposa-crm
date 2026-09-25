import "dotenv/config";
import path from "node:path";
import { db } from "../lib/db";
import { APPROVED_WORKBOOK, buildFullCatalogPlan } from "../lib/catalog/full-import-planner";
import { readCatalogImportNamespace } from "../lib/catalog/full-import-target";
import { applyFullCatalogPlan } from "../lib/catalog/full-import-apply";

const arg=(name:string)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3);
if(!process.argv.includes("--apply"))throw new Error("Explicit --apply is required");
const organizationId=arg("organization"),branchId=arg("branch"),locationId=arg("location"),planHash=arg("plan-hash"),workbookSha256=arg("workbook-sha256"),databaseFingerprint=arg("database-fingerprint"),confirmationPhrase=arg("confirm-production-import");
if(!organizationId||!branchId||!locationId||!planHash||!workbookSha256||!databaseFingerprint||!confirmationPhrase)throw new Error("All production safety arguments are required");

async function main(){
 const namespace=await readCatalogImportNamespace(db,{organizationId:organizationId!,branchId:branchId!,locationId:locationId!});if(namespace.organization.name!=="MARIPOSA"||namespace.organization.slug!=="mariposa")throw new Error("Exact production MARIPOSA identity required");
 const plan=await buildFullCatalogPlan(path.resolve("import",APPROVED_WORKBOOK),namespace);
 const result=await applyFullCatalogPlan(db,plan,{organizationId:organizationId!,branchId:branchId!,locationId:locationId!,planSha256:planHash!,workbookSha256:workbookSha256!,databaseFingerprint:databaseFingerprint!,confirmationPhrase:confirmationPhrase!});console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
