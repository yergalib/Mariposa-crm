import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db } from "../lib/db";
import { normalizeScannableCode } from "../lib/catalog/scannable-code";
import { classifyOperationalIdentifier, resolveOperationalIdentifier, SCAN_PURPOSE_PERMISSIONS } from "../lib/inventory/operational-identifier";
import { resolveInventoryScan } from "../lib/inventory/scan";
import { createTenantContext } from "../lib/tenant/context";

const passed: string[] = [];
const pass = (name: string, condition: unknown) => { if (!condition) throw new Error(`FAIL ${name}`); passed.push(name); };
const rejects = async (run: () => Promise<unknown>) => { try { await run(); return false; } catch { return true; } };

async function cleanup(organizationIds: string[], userIds: string[]) {
  await db.productInstance.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.stockLevel.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.productVariant.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.product.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.size.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.membershipPermissionOverride.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.membershipBranchAccess.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.organizationMembership.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.location.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.branch.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  const suffix=randomUUID().slice(0,8), organizationIds:string[]=[], userIds:string[]=[];
  try {
    const organization=await db.organization.create({data:{name:"Scan foundation",slug:`scan-foundation-${suffix}`}}); organizationIds.push(organization.id);
    const other=await db.organization.create({data:{name:"Other tenant",slug:`scan-other-${suffix}`}}); organizationIds.push(other.id);
    const user=await db.user.create({data:{email:`scan-${suffix}@example.test`,displayName:"Scanner",passwordHash:"test"}}); userIds.push(user.id);
    const branch=await db.branch.create({data:{organizationId:organization.id,name:"Main",code:"MAIN",city:"Test",timezone:"UTC"}});
    const otherBranch=await db.branch.create({data:{organizationId:organization.id,name:"Other",code:"OTHER",city:"Test",timezone:"UTC"}});
    const location=await db.location.create({data:{organizationId:organization.id,branchId:branch.id,name:"Stock",code:"STOCK",type:"WAREHOUSE"}});
    const membership=await db.organizationMembership.create({data:{organizationId:organization.id,userId:user.id,role:"CASHIER",status:"ACTIVE",defaultBranchId:branch.id}});
    await db.membershipBranchAccess.create({data:{organizationId:organization.id,membershipId:membership.id,branchId:branch.id}});
    const actor={userId:user.id,membershipId:membership.id,role:"CASHIER" as const}, tenant=createTenantContext(organization.id);
    const size=await db.size.create({data:{organizationId:organization.id,sizeSystem:"HEIGHT_CM",code:"120",name:"120",recommendedHeightCm:120}});
    const size130=await db.size.create({data:{organizationId:organization.id,sizeSystem:"HEIGHT_CM",code:"130",name:"130",recommendedHeightCm:130}});
    const product=await db.product.create({data:{organizationId:organization.id,name:"Bulk",internalCode:"BULK-P",trackingMode:"BULK",publicationStatus:"ACTIVE"}});
    const variant=await db.productVariant.create({data:{organizationId:organization.id,productId:product.id,sizeId:size.id,sku:"BULK-SKU"}});
    const multi=await db.product.create({data:{organizationId:organization.id,name:"Multi",internalCode:"MULTI-P",trackingMode:"BULK",publicationStatus:"ACTIVE"}});
    await db.productVariant.createMany({data:[{organizationId:organization.id,productId:multi.id,sizeId:size.id,sku:"MULTI-1"},{organizationId:organization.id,productId:multi.id,sizeId:size130.id,sku:"MULTI-2"}]});
    const serialized=await db.product.create({data:{organizationId:organization.id,name:"Serialized",internalCode:"SER-P",trackingMode:"SERIALIZED",publicationStatus:"ACTIVE"}});
    const serializedVariant=await db.productVariant.create({data:{organizationId:organization.id,productId:serialized.id,sizeId:size.id,sku:"SER-SKU"}});
    const instance=await db.productInstance.create({data:{organizationId:organization.id,productVariantId:serializedVariant.id,inventoryNumber:"INV-1",barcode:"BAR-1",homeBranchId:branch.id,currentBranchId:branch.id,currentLocationId:location.id}});
    const archived=await db.product.create({data:{organizationId:organization.id,name:"Archived",internalCode:"OLD-P",trackingMode:"BULK",publicationStatus:"ARCHIVED",archivedAt:new Date()}});
    await db.productVariant.create({data:{organizationId:organization.id,productId:archived.id,sizeId:size.id,sku:"OLD-SKU"}});
    const otherSize=await db.size.create({data:{organizationId:other.id,sizeSystem:"HEIGHT_CM",code:"120",name:"120"}});
    const otherProduct=await db.product.create({data:{organizationId:other.id,name:"Secret",internalCode:"SECRET-P",trackingMode:"BULK",publicationStatus:"ACTIVE"}});
    await db.productVariant.create({data:{organizationId:other.id,productId:otherProduct.id,sizeId:otherSize.id,sku:"SECRET-SKU"}});

    pass("normalization is input-source agnostic",normalizeScannableCode("  ｂｕｌｋ-sku  ")==="BULK-SKU");
    pass("purpose permission mapping is explicit",SCAN_PURPOSE_PERMISSIONS.RETURN_RECEIVE[0]==="RETURN_PROCESS"&&SCAN_PURPOSE_PERMISSIONS.STOCKTAKE_COUNT[0]==="STOCKTAKE_COUNT");
    const before=await Promise.all([db.product.count({where:{organizationId:organization.id}}),db.productVariant.count({where:{organizationId:organization.id}}),db.productInstance.count({where:{organizationId:organization.id}}),db.inventoryMovement.count({where:{organizationId:organization.id}}),db.order.count({where:{organizationId:organization.id}})]);
    const bulk=await resolveOperationalIdentifier(tenant,{rawIdentifier:" bulk-sku ",purpose:"WAREHOUSE_LOOKUP",branchId:branch.id},actor);
    pass("BULK SKU resolves",bulk.kind==="BULK_VARIANT"&&bulk.variant.id===variant.id&&bulk.product.id===product.id);
    pass("safe DTO excludes finance",bulk.kind==="BULK_VARIANT"&&!Object.hasOwn(bulk,"purchaseCostMinor"));
    const exactProduct=await resolveOperationalIdentifier(tenant,{rawIdentifier:"BULK-P",purpose:"WAREHOUSE_LOOKUP"},actor);
    pass("exact product code requests variant selection",exactProduct.kind==="PRODUCT_NEEDS_VARIANT_SELECTION"&&exactProduct.variants.length===1);
    const multiProduct=await resolveOperationalIdentifier(tenant,{rawIdentifier:"MULTI-P",purpose:"WAREHOUSE_LOOKUP"},actor);
    pass("multi-variant product never selects arbitrarily",multiProduct.kind==="PRODUCT_NEEDS_VARIANT_SELECTION"&&multiProduct.variants.length===2);
    const serializedResult=await resolveOperationalIdentifier(tenant,{rawIdentifier:"bar-1",purpose:"WAREHOUSE_LOOKUP",branchId:branch.id},actor);
    pass("SERIALIZED barcode resolves exact instance",serializedResult.kind==="SERIALIZED_INSTANCE"&&serializedResult.instance.id===instance.id);
    pass("wrong selected branch is inaccessible",await rejects(()=>resolveOperationalIdentifier(tenant,{rawIdentifier:"BAR-1",purpose:"WAREHOUSE_LOOKUP",branchId:otherBranch.id},actor)));
    pass("tenant isolation returns not found",(await resolveOperationalIdentifier(tenant,{rawIdentifier:"SECRET-SKU",purpose:"WAREHOUSE_LOOKUP"},actor)).kind==="NOT_FOUND");
    pass("archived identifier is unavailable",(await resolveOperationalIdentifier(tenant,{rawIdentifier:"OLD-SKU",purpose:"WAREHOUSE_LOOKUP"},actor)).kind==="NOT_AVAILABLE");
    pass("ambiguous identifier fails closed",classifyOperationalIdentifier({variantCount:1,instanceCount:1,productCount:0})==="AMBIGUOUS_IDENTIFIER");
    pass("cashier cannot use order selection purpose",await rejects(()=>resolveOperationalIdentifier(tenant,{rawIdentifier:"BULK-SKU",purpose:"ORDER_ITEM_SELECT"},actor)));
    pass("cashier cannot use return purpose",await rejects(()=>resolveOperationalIdentifier(tenant,{rawIdentifier:"BULK-SKU",purpose:"RETURN_RECEIVE"},actor)));
    const legacy=await resolveInventoryScan(tenant,"BULK-SKU",actor,branch.id,"WAREHOUSE_LOOKUP");
    pass("legacy inventory adapter remains compatible",legacy?.kind==="BULK_VARIANT"&&legacy.variantId===variant.id);
    const after=await Promise.all([db.product.count({where:{organizationId:organization.id}}),db.productVariant.count({where:{organizationId:organization.id}}),db.productInstance.count({where:{organizationId:organization.id}}),db.inventoryMovement.count({where:{organizationId:organization.id}}),db.order.count({where:{organizationId:organization.id}})]);
    pass("resolver performs no mutation",JSON.stringify(before)===JSON.stringify(after));

    const [globalCss,designCss,sidebar,mobile]=await Promise.all([readFile("app/globals.css","utf8"),readFile("app/design-system.css","utf8"),readFile("components/Sidebar.tsx","utf8"),readFile("components/MobileNavigation.tsx","utf8")]);
    pass("obsolete mobile label hiding removed",!globalCss.includes(".nav-item span:last-child{display:none}"));
    pass("mobile labels own their explicit visible style",designCss.includes(".mobile-nav-label{display:block")&&sidebar.includes("mobile-nav-label"));
    pass("mobile links do not reuse desktop nav-item class",sidebar.includes('mode==="mobile"?"mobile-nav-item":"nav-item"'));
    pass("mobile and tablet breakpoints covered",designCss.includes("max-width:760px")&&designCss.includes("max-width:1100px")&&designCss.includes("min-width:761px"));
    pass("phone touch targets are 44px",designCss.includes("min-height:44px")&&designCss.includes("width:44px;height:44px"));
    pass("desktop navigation preserved",sidebar.includes("desktop-nav")&&designCss.includes(".desktop-nav{display:flex!important"));
    pass("menu closes on route and link navigation",sidebar.includes("key={active}")&&mobile.includes("closest(\"a\")"));
    pass("menu has accessible dialog controls",mobile.includes("aria-expanded")&&mobile.includes("aria-modal=\"true\"")&&mobile.includes("Escape"));
  } finally { await cleanup(organizationIds,userIds); }
  pass("fixtures cleaned",await db.organization.count({where:{slug:{startsWith:"scan-foundation-"}}})===0);
  console.log(`MOBILE/SCANNING FOUNDATION-1A targeted: ${passed.length}/${passed.length} passed`);
}
main().finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});
