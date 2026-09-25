import "dotenv/config";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { db } from "../lib/db";
import { APPROVED_WORKBOOK, buildFullCatalogPlan, type NamespaceSnapshot } from "../lib/catalog/full-import-planner";
import { readCatalogImportNamespace } from "../lib/catalog/full-import-target";
import { getCatalogImportDatabaseFingerprint } from "../lib/catalog/full-import-fingerprint";

if(process.argv.some(arg=>arg==="--apply"||arg.startsWith("--apply="))) throw new Error("FINAL-2 is dry-run only; --apply is intentionally unavailable.");
if(!process.argv.includes("--dry-run")) throw new Error("Explicit --dry-run is required.");

const workbookPath=path.resolve("import",APPROVED_WORKBOOK);
const artifactPath=path.resolve("import/generated/mariposa-full-catalog-dry-run.json");

async function readNamespace():Promise<NamespaceSnapshot>{
  return db.$transaction(async tx=>{
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return readCatalogImportNamespace(tx);
  },{timeout:120000});
}

async function main(){
  const before=await db.$queryRaw<Array<{products:bigint;variants:bigint;stock:bigint;movements:bigint;batches:bigint;references:bigint}>>`SELECT (SELECT count(*) FROM products) products,(SELECT count(*) FROM product_variants) variants,(SELECT coalesce(sum(quantity),0) FROM stock_levels) stock,(SELECT count(*) FROM inventory_movements) movements,(SELECT count(*) FROM catalog_import_batches) batches,(SELECT count(*) FROM catalog_source_references) references`;
  const namespace=await readNamespace(); const plan=await buildFullCatalogPlan(workbookPath,namespace);const databaseFingerprint=(await getCatalogImportDatabaseFingerprint(db,namespace.organization.id,namespace.branch.id,namespace.location.id)).sha256;
  const after=await db.$queryRaw<typeof before>`SELECT (SELECT count(*) FROM products) products,(SELECT count(*) FROM product_variants) variants,(SELECT coalesce(sum(quantity),0) FROM stock_levels) stock,(SELECT count(*) FROM inventory_movements) movements,(SELECT count(*) FROM catalog_import_batches) batches,(SELECT count(*) FROM catalog_source_references) references`;
  const serialize=(x:typeof before[number])=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,v.toString()]));
  if(JSON.stringify(serialize(before[0]))!==JSON.stringify(serialize(after[0])))throw new Error("Dry-run no-write guarantee failed");
  const artifact={...plan,databaseFingerprint,dryRun:{writesPerformed:false,before:serialize(before[0]),after:serialize(after[0])}};
  await mkdir(path.dirname(artifactPath),{recursive:true}); await writeFile(artifactPath,`${JSON.stringify(artifact,null,2)}\n`,"utf8");
  console.log(JSON.stringify({artifactPath,planSha256:plan.planSha256,databaseFingerprint,workbook:plan.workbook,target:plan.target,totals:plan.totals,sizeSystemTotals:plan.sizeSystemTotals,dryRun:artifact.dryRun},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
