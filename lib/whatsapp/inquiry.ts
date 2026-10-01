import "server-only";
import { db } from "@/lib/db";
import { getVariantAvailability } from "@/lib/availability/capacity";
import { getSignedProductImageRenditionUrl } from "@/lib/catalog/images";
import { parseBusinessLocalDateTime } from "@/lib/calendar/timezone";
import { canAccessBranch } from "@/lib/staff/branch-access";
import type { TenantContext } from "@/lib/tenant/context";
import type { AuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";

export async function getInquiryBranches(tenant:TenantContext,allowedBranchIds:string[]|null){
  return db.branch.findMany({where:{organizationId:tenant.organizationId,status:"ACTIVE",id:allowedBranchIds?{in:allowedBranchIds}:undefined},select:{id:true,name:true,timezone:true},orderBy:{name:"asc"}});
}

export async function lookupRentalInquiry(tenant:TenantContext,actor:Pick<AuthContext,"membershipId"|"role">,input:{branchId:string;search:string;size:string;from:string;until:string}){
  const permissionContext = { organizationId: tenant.organizationId, membershipId: actor.membershipId, role: actor.role };
  await requirePermission(permissionContext, "CATALOG_VIEW");
  await requirePermission(permissionContext, "INVENTORY_VIEW");
  if(!await canAccessBranch(tenant,actor.membershipId,input.branchId))throw new Error("Филиал недоступен.");
  const branch=await db.branch.findFirst({where:{id:input.branchId,organizationId:tenant.organizationId,status:"ACTIVE"},select:{timezone:true}});
  if(!branch)throw new Error("Филиал недоступен.");
  const from=parseBusinessLocalDateTime(input.from,branch.timezone),until=parseBusinessLocalDateTime(input.until,branch.timezone);
  if(from>=until||until.getTime()-from.getTime()>31*24*60*60*1000)throw new RangeError("Период должен быть положительным и не больше 31 дня.");
  const search=input.search.trim().slice(0,100),size=input.size.trim().slice(0,30);
  if(search.length<2&&!size)throw new RangeError("Укажите модель или размер.");
  const now=new Date();
  const variants=await db.productVariant.findMany({
    where:{organizationId:tenant.organizationId,isActive:true,product:{organizationId:tenant.organizationId,publicationStatus:"ACTIVE",archivedAt:null,isRentable:true},...(search?{OR:[{sku:{contains:search,mode:"insensitive"}},{product:{OR:[{name:{contains:search,mode:"insensitive"}},{internalCode:{contains:search,mode:"insensitive"}}]}}]}:{}),...(size?{size:{organizationId:tenant.organizationId,OR:[{code:{equals:size,mode:"insensitive"}},{name:{equals:size,mode:"insensitive"}}]}}:{})},
    select:{id:true,sku:true,size:{select:{code:true,name:true}},execution:{select:{name:true}},product:{select:{id:true,name:true,images:{where:{organizationId:tenant.organizationId,status:"ACTIVE",productVariantId:null},select:{storageKey:true},orderBy:[{isPrimary:"desc"},{sortOrder:"asc"}],take:1}}},prices:{where:{organizationId:tenant.organizationId,type:"RENTAL",validFrom:{lte:now},AND:[{OR:[{validUntil:null},{validUntil:{gt:now}}]},{OR:[{branchId:input.branchId},{branchId:null}]}]},select:{branchId:true,amountMinor:true,currency:true},orderBy:{validFrom:"desc"}}},
    orderBy:[{product:{name:"asc"}},{size:{sortOrder:"asc"}},{id:"asc"}],take:8
  });
  const results=[];
  for(const variant of variants){
    const availability=await getVariantAvailability({tenant,branchId:input.branchId,productVariantId:variant.id,requestedFrom:from,requestedUntil:until});
    const price=variant.prices.find(row=>row.branchId===input.branchId)??variant.prices.find(row=>row.branchId===null);
    results.push({id:variant.id,productId:variant.product.id,name:variant.product.name,execution:variant.execution?.name??null,size:variant.size.name||variant.size.code,sku:variant.sku,available:availability.availableCapacity,price:price?{amountMinor:price.amountMinor,currency:price.currency}:null,imageUrl:variant.product.images[0]?await getSignedProductImageRenditionUrl(variant.product.images[0].storageKey,"messaging"):null});
  }
  return results;
}
