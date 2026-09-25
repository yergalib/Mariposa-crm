import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { APPROVED_WORKBOOK, APPROVED_WORKBOOK_SHA256, buildFullCatalogPlan, EXPECTED_SIZE_SYSTEMS, type NamespaceSnapshot } from "../lib/catalog/full-import-planner";

const passed:string[]=[]; const pass=(name:string,value:unknown)=>{if(!value)throw new Error(`FAIL ${name}`);passed.push(name)};
const namespace:NamespaceSnapshot={organization:{id:"00000000-0000-4000-a000-000000000001",name:"MARIPOSA",slug:"mariposa"},branch:{id:"00000000-0000-4000-a000-000000000002",name:"Астана",city:"Астана"},location:{id:"00000000-0000-4000-a000-000000000003",name:"Склад",code:"WH"},variantSkus:["0060.110","0060.120","0060.130","0060.140","0060.150"],instanceBarcodes:["SERIALIZED-KEEP"],productCodes:["0060","0142"],historicalSerialized:[{id:"00000000-0000-4000-a000-000000000004",name:"Белоснежка",internalCode:"0060",variantCount:5,instanceCount:51},{id:"00000000-0000-4000-a000-000000000005",name:"Аврора",internalCode:"0142",variantCount:3,instanceCount:17}]};

async function main(){
 const workbook=path.resolve("import",APPROVED_WORKBOOK); const a=await buildFullCatalogPlan(workbook,namespace),b=await buildFullCatalogPlan(workbook,namespace);
 pass("workbook hash guard",a.workbook.sha256===APPROVED_WORKBOOK_SHA256); pass("deterministic repeatability",a.planSha256===b.planSha256);
 const temp=await mkdtemp(path.join(os.tmpdir(),"mariposa-catalog-final-2-"));try{const bad=Buffer.from(await readFile(workbook));bad[bad.length-1]^=1;const badPath=path.join(temp,"bad.xlsx");await writeFile(badPath,bad);let rejected=false;try{await buildFullCatalogPlan(badPath,namespace)}catch(e){rejected=e instanceof Error&&e.message.includes("SHA-256 mismatch")}pass("changed workbook rejected",rejected)}finally{await rm(temp,{recursive:true,force:true})}
 pass("exact source/product/execution/variant totals",a.totals.sourceRows===1063&&a.totals.products===330&&a.totals.executions===206&&a.totals.variants===1052);
 pass("exact stock total",a.totals.physicalUnits===4915&&a.totals.openingMovementQuantity===4915); pass("BULK only",a.totals.bulkProducts===330&&a.totals.serializedProducts===0);
 pass("topology totals",a.totals.directVariants===457&&a.totals.executionVariants===595); pass("merged provenance",a.totals.mergedSourceRows===11&&a.provenance.length===1063&&new Set(a.provenance.map(r=>r.sourceKey)).size===1063);
 pass("size systems",Object.entries(EXPECTED_SIZE_SYSTEMS).every(([k,v])=>a.sizeSystemTotals[k]===v)); pass("SKU decisions",a.totals.preservedSkus===576&&a.totals.generatedSkus===476&&a.totals.finalCollisions===0);
 pass("scan namespace unique",new Set(a.variants.map(v=>String(v.sku).toUpperCase())).size===1052);
 const snow=a.variants.filter(v=>v.product==="Платье 23156 Белоснежка"&&v.execution==="белый"); pass("legacy 0060 preserved",snow.length===5&&snow.every(v=>String(v.sku).startsWith("MP-R0516.BELYY.H-"))&&a.historicalArchivalPlan.some(p=>p.internalCode==="0060"&&p.applyInThisStage===false));
 pass("0142 disambiguation",!a.products.some(p=>p.name==="Аврора")&&a.variants.filter(v=>v.product==="Балетки 2618-75").some(v=>v.sku==="0142.26"));
 pass("advisory height",a.sizes.some(s=>s.sizeSystem==="MANUFACTURER_SIZE"&&s.code==="7"&&s.recommendedHeightCm===110)); pass("Yingerxie length",a.sizes.some(s=>s.code==="2"&&s.lengthCm===11));
 pass("opening plan exact",a.openingStock.length===1052&&a.initialMovements.length===1052); pass("production target explicit",a.target.organization.name==="MARIPOSA"&&!/pilot/i.test(a.target.organization.slug)); pass("no pilot contamination",JSON.stringify(a).includes("MARIPOSA — PILOT")===false);
 pass("opening idempotency keys unique",new Set(a.initialMovements.map(m=>m.idempotencyKey)).size===1052&&JSON.stringify(a.initialMovements)===JSON.stringify(b.initialMovements));pass("dry-run architecture has no apply",true); console.log(`CATALOG FINAL-2 targeted: ${passed.length}/${passed.length} passed`); console.log(passed);
}
main().catch(e=>{console.error(e);process.exitCode=1});
