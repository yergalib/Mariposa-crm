import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { TenantContext } from "@/lib/tenant/context";
import { authorizeBulkOperation, type BulkOperationalActor } from "@/lib/fulfillment/bulk-authorization";
import { lockCapacityResources, lockInstanceResources } from "@/lib/inventory/capacity-lock";
import { getPermanentFleetReductionAvailabilityWithClient } from "@/lib/availability/capacity";
import { getActiveBulkMaintenanceQuantity } from "@/lib/inventory/bulk-maintenance-state";
import { appendAuditLog } from "@/lib/audit/log";
import { PurchaseError } from "./errors";
const schema=z.object({purchaseId:z.uuid(),receiptLineId:z.uuid(),locationId:z.uuid(),instanceId:z.uuid().optional(),quantity:z.number().int().min(1).max(1000000),reason:z.string().trim().min(3).max(500),idempotencyKey:z.string().trim().min(1).max(150),confirmed:z.literal(true)});
export async function returnToSupplier(tenant:TenantContext,raw:unknown,actor:BulkOperationalActor,client?:Prisma.TransactionClient){
 const input=schema.parse(raw),key=`supplier-return:${createHash("sha256").update(input.idempotencyKey).digest("hex")}`;
 const run=async(tx:Prisma.TransactionClient)=>{
  for(const permission of ["PURCHASE_VIEW","PURCHASE_RECEIVE","INVENTORY_WRITE_OFF"] as const)await authorizeBulkOperation(tx,tenant,actor,permission);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenant.organizationId+":purchase:"+input.purchaseId},0))`;
  const line=await tx.purchaseReceiptLine.findFirst({where:{id:input.receiptLineId,organizationId:tenant.organizationId,purchaseReceipt:{purchaseId:input.purchaseId}},include:{purchaseReceipt:{include:{purchase:true}},productVariant:{select:{product:{select:{trackingMode:true}}}}}});
  if(!line)throw new PurchaseError("NOT_FOUND","Исходное поступление не найдено.");
  const receipt=line.purchaseReceipt,purchase=receipt.purchase;
  await authorizeBulkOperation(tx,tenant,actor,"PURCHASE_RECEIVE",receipt.branchId);
  if(!["PARTIALLY_RECEIVED","RECEIVED","CLOSED"].includes(purchase.status))throw new PurchaseError("INVALID_STATE","Возврат доступен по фактически принятой закупке.");
  await lockCapacityResources(tx,[{organizationId:tenant.organizationId,branchId:receipt.branchId,productVariantId:line.productVariantId}]);
  await lockInstanceResources(tx,tenant.organizationId,input.instanceId?[input.instanceId]:[]);
  const replay=await tx.inventoryMovement.findUnique({where:{organizationId_idempotencyKey:{organizationId:tenant.organizationId,idempotencyKey:key}}});
  if(replay){if(replay.type!=="SUPPLIER_RETURN"||replay.supplierReturnReceiptLineId!==line.id||replay.quantity!==-input.quantity||replay.fromLocationId!==input.locationId||replay.productInstanceId!==(input.instanceId??null)||replay.reason!==input.reason)throw new PurchaseError("CONFLICT","Ключ возврата использован с другими данными.");return replay;}
  const previous=await tx.inventoryMovement.aggregate({where:{organizationId:tenant.organizationId,type:"SUPPLIER_RETURN",supplierReturnReceiptLineId:line.id},_sum:{quantity:true}});
  const returned=-(previous._sum.quantity??0);
  if(input.quantity>line.quantity-returned)throw new PurchaseError("INVALID","Количество превышает остаток исходного поступления.");
  const location=await tx.location.findFirst({where:{id:input.locationId,organizationId:tenant.organizationId,branchId:receipt.branchId,isActive:true,type:{notIn:["CLEANING","REPAIR","TRANSIT"]}}});
  if(!location)throw new PurchaseError("INVALID","Нужна складская локация исходного филиала. Товар на обслуживании сначала требует завершения обслуживания.");
  const now=new Date(),serial=line.productVariant.product.trackingMode==="SERIALIZED";
  if(serial!==Boolean(input.instanceId)||serial&&input.quantity!==1)throw new PurchaseError("INVALID","Выберите исходный экземпляр либо количество BULK.");
  const capacity=await getPermanentFleetReductionAvailabilityWithClient(tx,{tenant,branchId:receipt.branchId,productVariantId:line.productVariantId,quantity:input.quantity,confirmedAt:now});
  if(!capacity.canFulfill)throw new PurchaseError("INVALID_STATE","Товар нужен для существующих резервов или находится на обслуживании. Возврат поставщику недоступен.");
  let value=line.totalAcquisitionCostMinor*BigInt(returned+input.quantity)/BigInt(line.quantity)-line.totalAcquisitionCostMinor*BigInt(returned)/BigInt(line.quantity);
  if(serial){
   const instance=await tx.productInstance.findFirst({where:{id:input.instanceId,organizationId:tenant.organizationId,purchaseReceiptLineId:line.id,productVariantId:line.productVariantId,currentBranchId:receipt.branchId,currentLocationId:location.id,operationalStatus:"AVAILABLE",retiredAt:null,saleInventoryCommitments:{none:{status:"ACTIVE"}},capacityAllocations:{none:{status:"ACTIVE",OR:[{blockedUntil:null},{blockedUntil:{gt:now}}]}}}});
   if(!instance||instance.purchaseCostMinor===null)throw new PurchaseError("INVALID_STATE","Исходный экземпляр недоступен или не имеет подтверждённой стоимости.");
   value=instance.purchaseCostMinor;
   await tx.productInstance.update({where:{id:instance.id},data:{operationalStatus:"RETURNED_TO_SUPPLIER",retiredAt:now,version:{increment:1}}});
   await tx.instanceStatusHistory.create({data:{organizationId:tenant.organizationId,productInstanceId:instance.id,fromStatus:"AVAILABLE",toStatus:"RETURNED_TO_SUPPLIER",reason:input.reason,sourceType:"SUPPLIER_RETURN",sourceId:line.id,changedByUserId:actor.userId,changedAt:now}});
  }else{
   const level=await tx.stockLevel.findFirst({where:{organizationId:tenant.organizationId,branchId:receipt.branchId,locationId:location.id,productVariantId:line.productVariantId}});
   const blocked=await getActiveBulkMaintenanceQuantity(tx,{organizationId:tenant.organizationId,branchId:receipt.branchId,productVariantId:line.productVariantId,locationId:location.id});
   if(!level||level.quantity-blocked<input.quantity)throw new PurchaseError("INVALID_STATE","Недостаточно свободного физического остатка в выбранной локации.");
   await tx.stockLevel.update({where:{id:level.id},data:{quantity:{decrement:input.quantity}}});
  }
  const movement=await tx.inventoryMovement.create({data:{organizationId:tenant.organizationId,productVariantId:line.productVariantId,productInstanceId:input.instanceId,type:"SUPPLIER_RETURN",quantity:-input.quantity,fromBranchId:receipt.branchId,fromLocationId:location.id,sourceType:"SUPPLIER_RETURN",sourceId:purchase.id,supplierReturnReceiptLineId:line.id,supplierReturnValueMinor:value,idempotencyKey:key,reason:input.reason,createdByUserId:actor.userId,occurredAt:now}});
  await appendAuditLog(tx,{organizationId:tenant.organizationId,branchId:receipt.branchId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,action:"SUPPLIER_RETURN_RECORDED",entityType:"InventoryMovement",entityId:movement.id,correlationId:key,metadata:{purchaseId:purchase.id,supplierId:purchase.supplierId,receiptLineId:line.id,quantity:input.quantity,valueMinor:value.toString(),currency:line.currency,financialSettlement:"NOT_RECORDED"}});
  return movement;
 };
 return client?run(client):db.$transaction(run,{maxWait:10000,timeout:30000});
}
