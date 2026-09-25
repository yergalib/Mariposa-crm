import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { db } from "../lib/db";
import type { FullCatalogPlan } from "../lib/catalog/full-import-planner";
import { verifyAppliedCatalog } from "../lib/catalog/full-import-apply";

const arg=(name:string)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3);const organizationId=arg("organization"),branchId=arg("branch"),locationId=arg("location"),planHash=arg("plan-hash"),workbookSha256=arg("workbook-sha256");if(!organizationId||!branchId||!locationId||!planHash||!workbookSha256)throw new Error("Verifier requires exact target and approved hashes");
async function main(){const plan=JSON.parse(await readFile(path.resolve("import/generated/mariposa-full-catalog-dry-run.json"),"utf8")) as FullCatalogPlan;if(plan.planSha256!==planHash||plan.workbook.sha256!==workbookSha256||plan.target.organization.id!==organizationId||plan.target.branch.id!==branchId||plan.target.location.id!==locationId)throw new Error("Verifier approved plan/target mismatch");const batches=await db.catalogImportBatch.findMany({where:{organizationId:organizationId!,sourceSha256:workbookSha256!,planSha256:planHash!},select:{id:true}});if(batches.length!==1)throw new Error(`Expected one exact import batch, found ${batches.length}`);const result=await verifyAppliedCatalog(db,plan,batches[0].id,{organizationId:organizationId!,branchId:branchId!,locationId:locationId!});if(!result.ok)throw new Error(result.errors.join("; "));console.log(JSON.stringify(result,null,2));}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
