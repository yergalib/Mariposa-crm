import "dotenv/config";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { db } from "../lib/db";
import { APPROVED_WORKBOOK, buildFullCatalogPlan, type NamespaceSnapshot } from "../lib/catalog/full-import-planner";

if(process.argv.some(arg=>arg==="--apply"||arg.startsWith("--apply="))) throw new Error("FINAL-2 is dry-run only; --apply is intentionally unavailable.");
if(!process.argv.includes("--dry-run")) throw new Error("Explicit --dry-run is required.");

const workbookPath=path.resolve("import",APPROVED_WORKBOOK);
const artifactPath=path.resolve("import/generated/mariposa-full-catalog-dry-run.json");

async function readNamespace():Promise<NamespaceSnapshot>{
  return db.$transaction(async tx=>{
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const organizations=await tx.organization.findMany({where:{name:"MARIPOSA",status:"ACTIVE"},select:{id:true,name:true,slug:true}});
    if(organizations.length!==1)throw new Error(`Production organization is ambiguous: ${organizations.length} exact active MARIPOSA matches`); const organization=organizations[0];
    if(/pilot/i.test(organization.slug)||/PILOT/i.test(organization.name))throw new Error("Pilot organization cannot be the production import target");
    const branches=await tx.branch.findMany({where:{organizationId:organization.id,status:"ACTIVE",OR:[{city:{equals:"Astana",mode:"insensitive"}},{city:{equals:"Астана",mode:"insensitive"}},{name:{equals:"Astana",mode:"insensitive"}},{name:{equals:"Астана",mode:"insensitive"}}]},select:{id:true,name:true,city:true}});
    if(branches.length!==1)throw new Error(`Production Astana branch is ambiguous: ${branches.length} matches`); const branch=branches[0];
    const locations=await tx.location.findMany({where:{organizationId:organization.id,branchId:branch.id,isActive:true,type:{in:["WAREHOUSE","SHOWROOM"]}},orderBy:[{type:"asc"},{code:"asc"}],select:{id:true,name:true,code:true}});
    if(locations.length!==1)throw new Error(`Production opening-stock location is ambiguous: ${locations.length} active warehouse/showroom matches`); const location=locations[0];
    const variants=await tx.productVariant.findMany({where:{organizationId:organization.id},select:{sku:true}});
    const instances=await tx.productInstance.findMany({where:{organizationId:organization.id},select:{barcode:true}});
    const codes=await tx.product.findMany({where:{organizationId:organization.id},select:{internalCode:true}});
    const historical=await tx.product.findMany({where:{organizationId:organization.id,trackingMode:"SERIALIZED",internalCode:{in:["0060","0142"]}},select:{id:true,name:true,internalCode:true,_count:{select:{variants:true}},variants:{select:{_count:{select:{instances:true}}}}}});
    return {organization,branch,location,variantSkus:variants.map(v=>v.sku),instanceBarcodes:instances.map(v=>v.barcode),productCodes:codes.map(v=>v.internalCode),historicalSerialized:historical.map(p=>({id:p.id,name:p.name,internalCode:p.internalCode,variantCount:p._count.variants,instanceCount:p.variants.reduce((n,v)=>n+v._count.instances,0)}))};
  },{timeout:120000});
}

async function main(){
  const before=await db.$queryRaw<Array<{products:bigint;variants:bigint;stock:bigint;movements:bigint;batches:bigint;references:bigint}>>`SELECT (SELECT count(*) FROM products) products,(SELECT count(*) FROM product_variants) variants,(SELECT coalesce(sum(quantity),0) FROM stock_levels) stock,(SELECT count(*) FROM inventory_movements) movements,(SELECT count(*) FROM catalog_import_batches) batches,(SELECT count(*) FROM catalog_source_references) references`;
  const namespace=await readNamespace(); const plan=await buildFullCatalogPlan(workbookPath,namespace);
  const after=await db.$queryRaw<typeof before>`SELECT (SELECT count(*) FROM products) products,(SELECT count(*) FROM product_variants) variants,(SELECT coalesce(sum(quantity),0) FROM stock_levels) stock,(SELECT count(*) FROM inventory_movements) movements,(SELECT count(*) FROM catalog_import_batches) batches,(SELECT count(*) FROM catalog_source_references) references`;
  const serialize=(x:typeof before[number])=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,v.toString()]));
  if(JSON.stringify(serialize(before[0]))!==JSON.stringify(serialize(after[0])))throw new Error("Dry-run no-write guarantee failed");
  const artifact={...plan,dryRun:{writesPerformed:false,before:serialize(before[0]),after:serialize(after[0])}};
  await mkdir(path.dirname(artifactPath),{recursive:true}); await writeFile(artifactPath,`${JSON.stringify(artifact,null,2)}\n`,"utf8");
  console.log(JSON.stringify({artifactPath,planSha256:plan.planSha256,workbook:plan.workbook,target:plan.target,totals:plan.totals,sizeSystemTotals:plan.sizeSystemTotals,dryRun:artifact.dryRun},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
