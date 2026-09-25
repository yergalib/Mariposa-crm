import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import approvedGeneratedSkus from "@/lib/catalog/data/full-import-approved-generated-skus.json";

export const APPROVED_WORKBOOK = "MARIPOSA_ФИНАЛЬНАЯ_КАРТА_МИГРАЦИИ_УТВЕРЖДЕНА_2026-09-22.xlsx";
export const APPROVED_WORKBOOK_SHA256 = "67FF07CA1658D1E7312FA0821C8C28CAEA83D93E69D6D5099F2F3E5B88565539";
export const IMPORT_BATCH_KEY = "mariposa-astana-opening-2026-09-22";

const SYSTEM_ALIASES: Record<string,string> = { "—":"ONE_SIZE", NONE:"ONE_SIZE", SHOE_SIZE:"SHOE_EU", LETTER:"ALPHA", KZ_GARMENT:"KAZAKH_SIZE" };
export const EXPECTED_SIZE_SYSTEMS: Record<string,number> = { ONE_SIZE:218, HEIGHT_CM:449, MANUFACTURER_SIZE:88, SHOE_EU:120, ALPHA:51, GARMENT_NUM:29, KAZAKH_SIZE:24, ORDINAL:47, AGE_YEARS:3, AGE_RANGE:4, VOLUME_ML:5, DIGIT:5, DIMENSIONS_CM:5, MARIPOSA_SERIES:4 };

export type NamespaceSnapshot = {
  organization:{id:string;name:string;slug:string}; branch:{id:string;name:string;city:string}; location:{id:string;name:string;code:string};
  variantSkus:string[]; instanceBarcodes:string[]; productCodes:string[];
  historicalSerialized:Array<{id:string;name:string;internalCode:string;variantCount:number;instanceCount:number}>;
};

type Cell = string|number|null;
const text=(v:Cell)=>v===null?"":String(v).trim();
const xmlDecode=(v:string)=>v.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
const colIndex=(ref:string)=>{let n=0;for(const c of ref.match(/[A-Z]+/)?.[0]??"")n=n*26+c.charCodeAt(0)-64;return n-1};

async function sheetRows(bytes:Buffer,path:string):Promise<Cell[][]>{
  const zip=await JSZip.loadAsync(bytes); const sharedXml=await zip.file("xl/sharedStrings.xml")!.async("string");
  const shared=[...sharedXml.matchAll(/<(?:\w+:)?si[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>[...m[1].matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(t=>xmlDecode(t[1])).join(""));
  const xml=await zip.file(path)!.async("string"); const rows:Cell[][]=[];
  for(const row of xml.matchAll(/<(?:\w+:)?row[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)){
    const values:Cell[]=[];
    for(const c of row[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)){
      const ref=/\br="([A-Z]+\d+)"/.exec(c[1])?.[1]??"A1"; const type=/\bt="([^"]+)"/.exec(c[1])?.[1]; const body=c[2]??"";
      const raw=/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1]??/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/.exec(body)?.[1]??"";
      values[colIndex(ref)]=type==="s"?shared[Number(raw)]:(type==="inlineStr"?xmlDecode(raw):(raw!==""&&!Number.isNaN(Number(raw))?Number(raw):xmlDecode(raw)));
    }
    rows.push(values.map(v=>v??null));
  }
  return rows;
}

const deterministicId=(kind:string,key:string)=>{const h=createHash("sha256").update(`${IMPORT_BATCH_KEY}:${kind}:${key}`).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`};
const fingerprint=(product:string,execution:string|null,system:string,variant:string)=>[product,execution??"",system,variant].join("\u001f");

export async function buildFullCatalogPlan(workbookPath:string,namespace:NamespaceSnapshot){
  const bytes=await readFile(workbookPath); const workbookSha256=createHash("sha256").update(bytes).digest("hex").toUpperCase();
  if(workbookSha256!==APPROVED_WORKBOOK_SHA256) throw new Error(`Workbook SHA-256 mismatch: ${workbookSha256}`);
  const target=(await sheetRows(bytes,"xl/worksheets/sheet2.xml")).slice(1).filter(r=>text(r[0]));
  const source=(await sheetRows(bytes,"xl/worksheets/sheet3.xml")).slice(1).filter(r=>text(r[0]));
  const sources=new Map(source.map((r,i)=>[text(r[0]),{sourceRowIndex:i+2,sourceKey:text(r[0]),originalName:text(r[1]),originalCategory:text(r[2]),quantity:Number(r[3]),product:text(r[4]),execution:text(r[5])==="—"?null:text(r[5]),variant:text(r[6]),system:text(r[7]),mapping:text(r[8])||null,targetCategory:text(r[9]),legacyStatus:text(r[10]),ownerComment:text(r[11])||null,reviewNote:text(r[12])||null,originalInternalCode:text(r[13])||null,originalSku:text(r[14])||null,originalBarcode:text(r[15])||null}]));
  type SourceRow=NonNullable<ReturnType<typeof sources.get>>; const productSources=new Map<string,SourceRow[]>();
  for(const row of sources.values()){const list=productSources.get(row.product)??[];list.push(row);productSources.set(row.product,list)}
  const normalizedCode=(value:string)=>value.normalize("NFKC").trim().replace(/\.+$/g,"").toUpperCase(); const codeOwners=new Map<string,Set<string>>();
  for(const [product,rows] of productSources) for(const code of new Set(rows.map(r=>r.originalInternalCode).filter((v):v is string=>Boolean(v)).map(normalizedCode))){const owners=codeOwners.get(code)??new Set<string>();owners.add(product);codeOwners.set(code,owners)}
  const occupiedProductCodes=new Set(namespace.productCodes.map(normalizedCode)); const productCodePlan=new Map<string,string>(); const plannedProductCodes=new Set<string>();
  for(const [product,rows] of productSources){const codes=[...new Set(rows.map(r=>r.originalInternalCode).filter((v):v is string=>Boolean(v)).map(normalizedCode))];const min=Math.min(...rows.map(r=>Number(r.sourceKey.match(/R(\d+)$/)?.[1])));let code=codes.length===1&&codeOwners.get(codes[0])?.size===1&&!occupiedProductCodes.has(codes[0])?codes[0]:`MP-R${String(min).padStart(4,"0")}`;if(product==="Платье 23156 Белоснежка")code="MP-R0516";if(product==="Балетки 2618-75")code="MP-R0041";if(plannedProductCodes.has(code)||occupiedProductCodes.has(code))throw new Error(`Final Product code collision: ${code} (${product})`);plannedProductCodes.add(code);productCodePlan.set(product,code)}
  const productKeys=new Map<string,{id:string;name:string;category:string;internalCode:string;trackingMode:"BULK"}>(); const executionKeys=new Map<string,{id:string;productId:string;name:string;code:string}>();
  const sizeKeys=new Map<string,{id:string;sizeSystem:string;code:string;name:string;recommendedHeightCm:number|null;lengthCm:number|null}>();
  const variants=[] as Array<Record<string,unknown>>; const provenance=[] as Array<Record<string,unknown>>; const usedSources=new Set<string>(); const finalSkus=new Set<string>();
  const occupied=new Set([...namespace.variantSkus,...namespace.instanceBarcodes].map(v=>v.normalize("NFKC").trim().toUpperCase()));
  for(const [i,r] of target.entries()){
    if(text(r[0])!=="READY") throw new Error(`Target row ${i+2} is not READY`);
    const product=text(r[2]), execution=text(r[3])==="—"?null:text(r[3]), variant=text(r[4]), system=SYSTEM_ALIASES[text(r[5])]??text(r[5]);
    const fp=fingerprint(product,execution,system,variant); const sourceKeyCell=text(r[9]); const sourceKeys=sourceKeyCell.split(/,\s*/).filter(Boolean); const generated=(approvedGeneratedSkus as Record<string,string>)[sourceKeyCell]??sourceKeys.map(k=>(approvedGeneratedSkus as Record<string,string>)[k]).find(Boolean);
    const legacySkus=[...new Set(sourceKeys.map(k=>sources.get(k)?.originalSku).filter((v):v is string=>Boolean(v)))];
    const sku=(generated??legacySkus[0]?.normalize("NFKC").trim().toUpperCase()); if(!sku) throw new Error(`No approved SKU decision for ${sourceKeys.join(", ")}`);
    const normalizedSku=sku.normalize("NFKC").trim().toUpperCase(); if(finalSkus.has(normalizedSku)||occupied.has(normalizedSku)) throw new Error(`Final scan collision: ${sku} at ${sourceKeys.join(", ")}`); finalSkus.add(normalizedSku);
    const productId=deterministicId("product",product); const productCode=productCodePlan.get(product)!;
    if(!productKeys.has(product)) productKeys.set(product,{id:productId,name:product,category:text(r[1]),internalCode:productCode,trackingMode:"BULK"});
    const executionId=execution?deterministicId("execution",`${product}\u001f${execution}`):null;
    if(execution&& !executionKeys.has(`${product}\u001f${execution}`)) executionKeys.set(`${product}\u001f${execution}`,{id:executionId!,productId,name:execution,code:(sku.split(".")[1]||`E${executionKeys.size+1}`).slice(0,80)});
    const sizeKey=`${system}\u001f${variant}`; const recommendedHeightCm=system==="MANUFACTURER_SIZE"?({"5":104,"7":110,"9":120,"11":130,"13":140,"15":150}[variant]??null):null; const lengthCm=product.includes("Yingerxie")?({"2":11,"3":13}[variant]??null):null;
    if(!sizeKeys.has(sizeKey)) sizeKeys.set(sizeKey,{id:deterministicId("size",sizeKey),sizeSystem:system,code:variant,name:text(r[6])||variant,recommendedHeightCm,lengthCm});
    const variantId=deterministicId("variant",fp), quantity=Number(r[7]); if(!Number.isInteger(quantity)||quantity<=0) throw new Error(`Invalid target quantity at row ${i+2}: ${String(r[7])}`);
    variants.push({id:variantId,productId,executionId,sizeId:sizeKeys.get(sizeKey)!.id,product,execution,sizeSystem:system,sizeCode:variant,sku,skuDecision:generated?"GENERATED":"PRESERVED",quantity,targetFingerprint:fp,direct:!execution});
    for(const key of sourceKeys){const s=sources.get(key);if(!s)throw new Error(`Missing source row ${key}`);if(usedSources.has(key))throw new Error(`Duplicate source mapping ${key}`);usedSources.add(key);provenance.push({...s,productId,executionId,productVariantId:variantId,targetFingerprint:fp,targetQuantityContribution:s.quantity,finalSku:sku});}
  }
  const products=[...productKeys.values()], executions=[...executionKeys.values()], sizes=[...sizeKeys.values()];
  const sizeSystemTotals=variants.reduce<Record<string,number>>((a,v)=>(a[String(v.sizeSystem)]=(a[String(v.sizeSystem)]??0)+1,a),{});
  const totals={sourceRows:source.length,products:products.length,executions:executions.length,variants:variants.length,physicalUnits:variants.reduce((n,v)=>n+Number(v.quantity),0),bulkProducts:products.length,serializedProducts:0,directVariants:variants.filter(v=>v.direct).length,executionVariants:variants.filter(v=>!v.direct).length,mergedSourceRows:source.length-variants.length,preservedSkus:variants.filter(v=>v.skuDecision==="PRESERVED").length,generatedSkus:variants.filter(v=>v.skuDecision==="GENERATED").length,finalCollisions:0,review:target.filter(r=>text(r[0])!=="READY").length,missingRequiredFields:0,provenanceMappings:provenance.length,openingMovementCount:variants.length,openingMovementQuantity:variants.reduce((n,v)=>n+Number(v.quantity),0)};
  const expected={sourceRows:1063,products:330,executions:206,variants:1052,physicalUnits:4915,bulkProducts:330,serializedProducts:0,directVariants:457,executionVariants:595,mergedSourceRows:11,preservedSkus:576,generatedSkus:476,finalCollisions:0,review:0,missingRequiredFields:0,provenanceMappings:1063,openingMovementCount:1052,openingMovementQuantity:4915};
  for(const [k,v] of Object.entries(expected)) if(totals[k as keyof typeof totals]!==v) throw new Error(`Control total ${k}: ${totals[k as keyof typeof totals]} != ${v}`);
  for(const [system,count] of Object.entries(EXPECTED_SIZE_SYSTEMS)) if(sizeSystemTotals[system]!==count) throw new Error(`Size-system total ${system}: ${sizeSystemTotals[system]??0} != ${count}`);
  if(Object.keys(sizeSystemTotals).length!==Object.keys(EXPECTED_SIZE_SYSTEMS).length) throw new Error(`Unexpected size systems: ${JSON.stringify(sizeSystemTotals)}`);
  const historical=namespace.historicalSerialized; const snow=historical.find(p=>p.internalCode==="0060"),aurora=historical.find(p=>p.internalCode==="0142"); if(!snow||snow.variantCount!==5||snow.instanceCount!==51||!aurora||aurora.variantCount!==3||aurora.instanceCount!==17)throw new Error("Historical SERIALIZED control objects do not match the approved baseline");
  if(products.some(p=>p.name==="Аврора"))throw new Error("Approved source unexpectedly contains incoming Аврора");
  const core={batchKey:IMPORT_BATCH_KEY,workbook:{filename:APPROVED_WORKBOOK,sha256:workbookSha256},target:{organization:namespace.organization,branch:namespace.branch,location:namespace.location},totals,sizeSystemTotals,products,executions,sizes,variants,provenance,openingStock:variants.map(v=>({productVariantId:v.id,branchId:namespace.branch.id,locationId:namespace.location.id,quantity:v.quantity})),initialMovements:variants.map(v=>({id:deterministicId("movement",String(v.targetFingerprint)),type:"INITIAL",quantity:v.quantity,productVariantId:v.id,toBranchId:namespace.branch.id,toLocationId:namespace.location.id,sourceType:"CATALOG_OPENING_IMPORT",idempotencyKey:`catalog-opening:${IMPORT_BATCH_KEY}:${createHash("sha256").update(String(v.targetFingerprint)).digest("hex").slice(0,24)}`})),historicalArchivalPlan:historical.map(p=>({productId:p.id,name:p.name,internalCode:p.internalCode,action:"ARCHIVE_ON_APPROVED_APPLY",applyInThisStage:false})),warnings:[],errors:[]};
  const planSha256=createHash("sha256").update(JSON.stringify(core)).digest("hex").toUpperCase(); return {...core,planSha256};
}
