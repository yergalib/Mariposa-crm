import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { createTenantContext } from "../lib/tenant/context";
import { addVariant, createProductExecution, createSize } from "../lib/catalog/management";
import { catalogSelectionLabel, catalogVariantLabel } from "../lib/catalog/labels";
import { createOrder } from "../lib/orders/management";
import { createSaleDraft } from "../lib/sales/lifecycle";
import { resolveInventoryScan } from "../lib/inventory/scan";
import { setPrimaryProductImage } from "../lib/catalog/images";

const passed:string[]=[];
const pass=(name:string,value:unknown)=>{if(!value)throw new Error(`FAIL ${name}`);passed.push(name);};
const rejects=async(fn:()=>Promise<unknown>)=>{try{await fn();return false}catch{return true}};
const rollback=new Error("CATALOG_PILOT_1_ROLLBACK");
const orgId=randomUUID(), otherOrgId=randomUUID(), suffix=orgId.slice(0,8);

async function cleanup(){
  await db.orderEvent.deleteMany({where:{organizationId:orgId}}); await db.orderItem.deleteMany({where:{organizationId:orgId}}); await db.order.deleteMany({where:{organizationId:orgId}}); await db.orderCounter.deleteMany({where:{organizationId:orgId}});
  await db.productImage.deleteMany({where:{organizationId:{in:[orgId,otherOrgId]}}}); await db.productPrice.deleteMany({where:{organizationId:{in:[orgId,otherOrgId]}}}); await db.productVariant.deleteMany({where:{organizationId:{in:[orgId,otherOrgId]}}}); await db.productExecution.deleteMany({where:{organizationId:{in:[orgId,otherOrgId]}}}); await db.product.deleteMany({where:{organizationId:{in:[orgId,otherOrgId]}}}); await db.size.deleteMany({where:{organizationId:{in:[orgId,otherOrgId]}}});
  await db.customer.deleteMany({where:{organizationId:orgId}}); await db.organizationMembership.deleteMany({where:{organizationId:orgId}}); await db.location.deleteMany({where:{organizationId:orgId}}); await db.branch.deleteMany({where:{organizationId:orgId}}); await db.user.deleteMany({where:{email:{startsWith:`catalog-pilot-1-${suffix}`}}}); await db.organization.deleteMany({where:{id:{in:[orgId,otherOrgId]}}});
}

async function main(){
  await db.organization.createMany({data:[{id:orgId,name:"Catalog Pilot 1",slug:`catalog-pilot-1-${suffix}`},{id:otherOrgId,name:"Catalog Pilot 1 other",slug:`catalog-pilot-1-other-${suffix}`} ]});
  const user=await db.user.create({data:{email:`catalog-pilot-1-${suffix}@example.test`,displayName:"Owner",passwordHash:"test"}});
  const branch=await db.branch.create({data:{organizationId:orgId,name:"Astana",code:`CP${suffix.slice(0,3)}`,city:"Astana",timezone:"Asia/Almaty"}});
  const location=await db.location.create({data:{organizationId:orgId,branchId:branch.id,name:"Showroom",code:"SHOW",type:"SHOWROOM"}});
  const membership=await db.organizationMembership.create({data:{organizationId:orgId,userId:user.id,role:"OWNER",status:"ACTIVE",defaultBranchId:branch.id}});
  const customer=await db.customer.create({data:{organizationId:orgId,customerNumber:`CP-${suffix}`,firstName:"Pilot"}});
  const tenant=createTenantContext(orgId), actor={userId:user.id,membershipId:membership.id,role:"OWNER" as const};
  const product=await db.product.create({data:{organizationId:orgId,name:"Pilot dress",internalCode:`PD-${suffix}`,trackingMode:"BULK",publicationStatus:"ACTIVE"}});
  const otherProduct=await db.product.create({data:{organizationId:orgId,name:"Other",internalCode:`PO-${suffix}`,trackingMode:"BULK",publicationStatus:"ACTIVE"}});
  const otherTenantProduct=await db.product.create({data:{organizationId:otherOrgId,name:"Other tenant",internalCode:`PT-${suffix}`,trackingMode:"BULK"}});
  pass("execution cross-tenant product rejected",await rejects(()=>db.productExecution.create({data:{organizationId:orgId,productId:otherTenantProduct.id,code:"WRONG",name:"Wrong"}})));
  const legacy=await createSize(tenant,{code:`LEG-${suffix}`,name:"Legacy",sizeSystem:null,sortOrder:0,isActive:true});
  pass("legacy size uses stable system",legacy.sizeSystem==="LEGACY");
  const height=await createSize(tenant,{code:"5",name:"5",sizeSystem:"MANUFACTURER_DRESS",recommendedHeightCm:104,lengthCm:null,sortOrder:5,isActive:true});
  const length=await createSize(tenant,{code:"2",name:"2",sizeSystem:"YINGERXIE",recommendedHeightCm:null,lengthCm:11,sortOrder:2,isActive:true});
  const sameCodeOtherSystem=await createSize(tenant,{code:"5",name:"5 years",sizeSystem:"AGE_YEARS",sortOrder:5,isActive:true});
  pass("same code in another system",sameCodeOtherSystem.id!==height.id);
  pass("duplicate code in same system rejected",await rejects(()=>createSize(tenant,{code:"5",name:"Duplicate",sizeSystem:"MANUFACTURER_DRESS",sortOrder:9,isActive:true})));
  pass("manufacturer mapping preserved",height.code==="5"&&height.recommendedHeightCm===104);
  pass("length mapping preserved",length.code==="2"&&length.lengthCm===11);
  const one=await createSize(tenant,{code:"ONE",name:"One",sizeSystem:"ONE_SIZE",sortOrder:0,isActive:true});
  pass("one size employee label",catalogVariantLabel({size:one})==="Без размера");
  const existing=await addVariant(tenant,{productId:otherProduct.id,sizeId:legacy.id,sku:`EXISTING-${suffix}`});
  const white=await createProductExecution(tenant,{productId:product.id,code:"WHITE",name:"Белый",sortOrder:1,isActive:true});
  const pink=await createProductExecution(tenant,{productId:product.id,code:"PINK",name:"Розовый",sortOrder:2,isActive:true});
  pass("multiple executions",white.productId===pink.productId&&white.id!==pink.id);
  const whiteVariant=await addVariant(tenant,{productId:product.id,executionId:white.id,sizeId:height.id,sku:`PD-WHITE-5-${suffix}`});
  const pinkVariant=await addVariant(tenant,{productId:product.id,executionId:pink.id,sizeId:height.id,sku:`PD-PINK-5-${suffix}`});
  pass("same size in two executions",whiteVariant.sizeId===pinkVariant.sizeId);
  pass("duplicate size inside execution rejected",await rejects(()=>addVariant(tenant,{productId:product.id,executionId:white.id,sizeId:height.id,sku:`PD-WHITE-X-${suffix}`})));
  const direct=await addVariant(tenant,{productId:product.id,sizeId:one.id,sku:`PD-ONE-${suffix}`});
  pass("product without execution",direct.executionId===null);
  pass("duplicate direct size rejected",await rejects(()=>addVariant(tenant,{productId:product.id,sizeId:one.id,sku:`PD-ONE-X-${suffix}`})));
  pass("cross product execution rejected",await rejects(()=>addVariant(tenant,{productId:otherProduct.id,executionId:white.id,sizeId:height.id,sku:`CROSS-P-${suffix}`})));
  const foreignExecution=await db.productExecution.create({data:{organizationId:otherOrgId,productId:otherTenantProduct.id,code:"FOREIGN",name:"Foreign"}});
  pass("cross organization execution rejected",await rejects(()=>db.productVariant.create({data:{organizationId:orgId,productId:product.id,executionId:foreignExecution.id,sizeId:height.id,sku:`CROSS-O-${suffix}`}})));
  pass("existing variant id preserved",(await db.productVariant.findUnique({where:{id:existing.id}}))?.id===existing.id);
  pass("execution aware label",catalogSelectionLabel({product,execution:pink,size:height})==="Pilot dress · Розовый · 5");
  await db.productImage.create({data:{organizationId:orgId,productId:product.id,storageKey:`cp1/${suffix}/product.webp`,mimeType:"image/webp",isPrimary:true}});
  await db.productImage.create({data:{organizationId:orgId,productId:product.id,executionId:white.id,storageKey:`cp1/${suffix}/white.webp`,mimeType:"image/webp",isPrimary:true}});
  await db.productImage.create({data:{organizationId:orgId,productId:product.id,executionId:pink.id,storageKey:`cp1/${suffix}/pink.webp`,mimeType:"image/webp",isPrimary:true}});
  pass("primary images are scope isolated",await db.productImage.count({where:{organizationId:orgId,productId:product.id,isPrimary:true}})===3);
  pass("duplicate execution primary rejected",await rejects(()=>db.productImage.create({data:{organizationId:orgId,productId:product.id,executionId:white.id,storageKey:`cp1/${suffix}/white2.webp`,mimeType:"image/webp",isPrimary:true}})));
  const whiteSecond=await db.productImage.create({data:{organizationId:orgId,productId:product.id,executionId:white.id,storageKey:`cp1/${suffix}/white-secondary.webp`,mimeType:"image/webp",isPrimary:false}});
  await setPrimaryProductImage(tenant,whiteSecond.id);
  pass("changing execution primary preserves other scopes",await db.productImage.count({where:{organizationId:orgId,productId:product.id,isPrimary:true}})===3&&await db.productImage.count({where:{organizationId:orgId,executionId:white.id,isPrimary:true}})===1);
  pass("cross product image execution rejected",await rejects(()=>db.productImage.create({data:{organizationId:orgId,productId:otherProduct.id,executionId:white.id,storageKey:`cp1/${suffix}/cross.webp`,mimeType:"image/webp"}})));
  await db.productPrice.createMany({data:[{organizationId:orgId,productVariantId:whiteVariant.id,type:"RENTAL",amountMinor:BigInt(1000),currency:"KZT",validFrom:new Date(0)},{organizationId:orgId,productVariantId:whiteVariant.id,type:"SALE",amountMinor:BigInt(2000),currency:"KZT",validFrom:new Date(0)}]});
  const rental=await createOrder(tenant,{branchId:branch.id,customerId:customer.id,source:"CRM",rentalStart:new Date("2027-01-01"),rentalEnd:new Date("2027-01-02"),discountMinor:BigInt(0),internalComment:null},[{productVariantId:whiteVariant.id,quantity:1}],{userId:user.id,membershipId:membership.id});
  pass("new rental snapshot contains execution",(await db.orderItem.findFirstOrThrow({where:{orderId:rental.id}})).variantNameSnapshot==="Белый · 5");
  pass("new sale snapshot formatter contains execution",catalogVariantLabel({execution:pink,size:height})==="Розовый · 5");
  const scan=await resolveInventoryScan(tenant,whiteVariant.sku,actor,branch.id);
  pass("existing sku resolves same variant",scan?.kind==="BULK_VARIANT"&&scan.variantId===whiteVariant.id&&scan.executionName==="Белый");
  console.log(`CATALOG PILOT-1 targeted: ${passed.length}/${passed.length} passed`); console.log(passed);
}

main().finally(async()=>{await cleanup();await db.$disconnect();}).catch(error=>{console.error(error);process.exitCode=1});
