import "server-only";
import { db } from "@/lib/db";
import type { InventoryMovementType } from "@/generated/prisma/client";
import type { TenantContext } from "@/lib/tenant/context";
async function currentBranchIds(tenant:TenantContext,provided?:string[]|null){if(provided!==undefined)return provided;try{const{getCurrentSession}=await import("@/lib/auth/session"),session=await getCurrentSession();if(session?.organizationId===tenant.organizationId&&!session.hasOrganizationWideBranchAccess)return session.allowedBranchIds}catch{}return null}
export async function getInventoryMovements(tenant:TenantContext,input:{type?:InventoryMovementType;branchId?:string;search?:string;cursor?:string;take?:number;allowedBranchIds?:string[]|null}){
  const take=Math.min(Math.max(input.take??50,1),100),query=input.search?.trim().slice(0,100),and=[],allowed=await currentBranchIds(tenant,input.allowedBranchIds);
  if(input.branchId){if(allowed&&!allowed.includes(input.branchId))return[];and.push({OR:[{fromBranchId:input.branchId},{toBranchId:input.branchId}]})}else if(allowed)and.push({OR:[{fromBranchId:{in:allowed}},{toBranchId:{in:allowed}}]});
  if(query)and.push({OR:[{productVariant:{sku:{contains:query,mode:"insensitive"as const}}},{productVariant:{product:{name:{contains:query,mode:"insensitive"as const}}}},{productInstance:{barcode:{contains:query,mode:"insensitive"as const}}},{productInstance:{inventoryNumber:{contains:query,mode:"insensitive"as const}}}]});
  return db.inventoryMovement.findMany({where:{organizationId:tenant.organizationId,...(input.type?{type:input.type}:{}),AND:and},include:{productVariant:{include:{product:{select:{name:true}},size:{select:{code:true}}}},productInstance:{select:{barcode:true,inventoryNumber:true}},fromBranch:{select:{name:true}},fromLocation:{select:{name:true}},toBranch:{select:{name:true}},toLocation:{select:{name:true}},createdBy:{select:{displayName:true}}},orderBy:[{occurredAt:"desc"},{id:"desc"}],take:take+1,...(input.cursor?{cursor:{id:input.cursor},skip:1}:{})})
}
export { getWarehouseSummary } from "@/lib/inventory/warehouse-summary";
