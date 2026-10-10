import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { authorizeBulkOperation, type BulkOperationalActor } from "@/lib/fulfillment/bulk-authorization";
import { lockOrderFinance } from "@/lib/finance/order-lock";
import { lockCapacityResources, lockInstanceResources } from "@/lib/inventory/capacity-lock";
import { createFinancialTransactionWithClient } from "@/lib/finance/transactions";
import { effectsFor } from "@/lib/finance/effects";
import { appendAuditLog } from "@/lib/audit/log";
import { OrderError } from "@/lib/orders/errors";
import { saleReturnValue } from "./return-valuation";

export const saleReturnInput=z.object({orderId:z.uuid(),commitmentId:z.uuid(),quantity:z.number().int().min(1).max(1000000),locationId:z.uuid(),outcome:z.enum(["GOOD","NEEDS_CLEANING","DAMAGED"]),reason:z.string().trim().min(3).max(500),idempotencyKey:z.string().trim().min(1).max(150),confirmed:z.literal(true)});
export async function recordSaleReturn(tenant:TenantContext,raw:unknown,actor:BulkOperationalActor,client?:Prisma.TransactionClient){
  const input=saleReturnInput.parse(raw);
  const key=`sale-return:${createHash("sha256").update(input.idempotencyKey).digest("hex")}`;
  const run=async(tx:Prisma.TransactionClient)=>{
    for(const permission of ["ORDER_VIEW","RETURN_PROCESS","RETURN_INSPECT","ORDER_DISCOUNT_MANAGE"] as const) await authorizeBulkOperation(tx,tenant,actor,permission);
    await lockOrderFinance(tx,tenant.organizationId,input.orderId);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM orders WHERE id=${input.orderId}::uuid AND organization_id=${tenant.organizationId}::uuid FOR UPDATE`);
    const order=await tx.order.findFirst({where:{id:input.orderId,organizationId:tenant.organizationId,type:"SALE",status:"COMPLETED"},include:{items:{where:{removedAt:null}},saleInventoryCommitments:true}});
    if(!order)throw new OrderError("NOT_FOUND","Выданная продажа не найдена.");
    await authorizeBulkOperation(tx,tenant,actor,"RETURN_PROCESS",order.branchId);
    const commitment=order.saleInventoryCommitments.find(row=>row.id===input.commitmentId&&row.status==="FULFILLED");
    if(!commitment)throw new OrderError("NOT_FOUND","Выданная позиция не найдена.");
    await lockCapacityResources(tx,[{organizationId:tenant.organizationId,branchId:order.branchId,productVariantId:commitment.productVariantId}]);
    await lockInstanceResources(tx,tenant.organizationId,commitment.productInstanceId?[commitment.productInstanceId]:[]);
    const replay=await tx.inventoryMovement.findUnique({where:{organizationId_idempotencyKey:{organizationId:tenant.organizationId,idempotencyKey:key}}});
    if(replay){
      if(replay.type!=="SALE_RETURN"||replay.sourceId!==order.id||replay.saleInventoryCommitmentId!==commitment.id||replay.quantity!==input.quantity||replay.toLocationId!==input.locationId||replay.saleReturnOutcome!==input.outcome||replay.reason!==input.reason)throw new OrderError("INVALID_STATE","Ключ возврата уже использован с другими данными.");
      return replay;
    }
    const history=await tx.inventoryMovement.findMany({where:{organizationId:tenant.organizationId,saleInventoryCommitment:{orderId:order.id},type:{in:["SALE_ISSUE","SALE_RETURN"]}}});
    const own=history.filter(row=>row.saleInventoryCommitmentId===commitment.id);
    const issued=-own.filter(row=>row.type==="SALE_ISSUE").reduce((n,row)=>n+row.quantity,0),returned=own.filter(row=>row.type==="SALE_RETURN").reduce((n,row)=>n+row.quantity,0);
    if(issued!==commitment.quantity||input.quantity>issued-returned)throw new OrderError("INVALID_STATE","Возврат превышает фактически выданное и ещё не возвращённое количество.");
    const location=await tx.location.findFirst({where:{id:input.locationId,organizationId:tenant.organizationId,branchId:order.branchId,isActive:true}});
    if(!location || (input.outcome==="GOOD" ? !["SHOWROOM","WAREHOUSE"].includes(location.type) : location.type!==(input.outcome==="DAMAGED"?"REPAIR":"CLEANING")))throw new OrderError("VALIDATION","Выберите место хранения, соответствующее результату осмотра.");
    const itemCommitments=new Set(order.saleInventoryCommitments.filter(row=>row.orderItemId===commitment.orderItemId).map(row=>row.id));
    const itemReturned=history.filter(row=>row.type==="SALE_RETURN"&&itemCommitments.has(row.saleInventoryCommitmentId!)).reduce((n,row)=>n+row.quantity,0);
    const value=saleReturnValue(order.items,order.totalMinor,commitment.orderItemId,itemReturned,input.quantity);
    const now=new Date();
    const instance=commitment.productInstanceId?await tx.productInstance.findFirst({where:{id:commitment.productInstanceId,organizationId:tenant.organizationId,productVariantId:commitment.productVariantId,currentBranchId:order.branchId,operationalStatus:"SOLD",retiredAt:null}}):null;
    if(commitment.productInstanceId&&(!instance||input.quantity!==1))throw new OrderError("INVALID_STATE","Этот экземпляр не находится в состоянии продан.");
    const movement=await tx.inventoryMovement.create({data:{organizationId:tenant.organizationId,productVariantId:commitment.productVariantId,productInstanceId:commitment.productInstanceId,type:"SALE_RETURN",quantity:input.quantity,toBranchId:order.branchId,toLocationId:location.id,sourceType:"SALE_RETURN",sourceId:order.id,saleInventoryCommitmentId:commitment.id,idempotencyKey:key,reason:input.reason,createdByUserId:actor.userId,occurredAt:now,saleReturnOutcome:input.outcome,saleReturnValueMinor:value}});
    if(instance){
      const status=input.outcome==="GOOD"?"AVAILABLE":input.outcome==="DAMAGED"?"REPAIR":"CLEANING";
      await tx.productInstance.update({where:{id:instance.id},data:{operationalStatus:status,currentLocationId:location.id,version:{increment:1}}});
      await tx.instanceStatusHistory.create({data:{organizationId:tenant.organizationId,productInstanceId:instance.id,fromStatus:"SOLD",toStatus:status,reason:input.reason,sourceType:"SALE_RETURN",sourceId:movement.id,changedByUserId:actor.userId,changedAt:now}});
      if(input.outcome!=="GOOD")await tx.capacityAllocation.create({data:{organizationId:tenant.organizationId,branchId:order.branchId,productVariantId:commitment.productVariantId,productInstanceId:instance.id,quantity:1,sourceType:"MAINTENANCE",sourceReferenceId:movement.id,saleReturnMovementId:movement.id,blockedFrom:now,maintenanceKind:input.outcome==="DAMAGED"?"REPAIR":"CLEANING",maintenanceLocationId:location.id,assignedByUserId:actor.userId}});
    }else{
      const where={organizationId:tenant.organizationId,branchId:order.branchId,productVariantId:commitment.productVariantId,locationId:location.id};
      const level=await tx.stockLevel.findFirst({where});
      if(level)await tx.stockLevel.update({where:{id:level.id},data:{quantity:{increment:input.quantity}}});
      else await tx.stockLevel.create({data:{...where,quantity:input.quantity}});
      if(input.outcome!=="GOOD")await tx.capacityAllocation.create({data:{organizationId:tenant.organizationId,branchId:order.branchId,productVariantId:commitment.productVariantId,quantity:input.quantity,sourceType:"MAINTENANCE",sourceReferenceId:movement.id,saleReturnMovementId:movement.id,blockedFrom:now,maintenanceKind:input.outcome==="DAMAGED"?"REPAIR":"CLEANING",maintenanceLocationId:location.id,assignedByUserId:actor.userId}});
    }
    // Non-cash credit, separate from immutable original sale pricing and payments.
    if(value>BigInt(0))await createFinancialTransactionWithClient(tx,tenant,"DISCOUNT",{branchId:order.branchId,customerId:order.customerId,orderId:order.id,amountMinor:value,currency:order.currency,sourceType:"SALE_RETURN",sourceId:movement.id,idempotencyKey:`sale-return-credit:${movement.id}`,reason:input.reason},actor,effectsFor("DISCOUNT",value));
    await tx.orderEvent.create({data:{organizationId:tenant.organizationId,orderId:order.id,eventType:"SALE_RETURN_RECEIVED",createdByUserId:actor.userId,payload:{movementId:movement.id,orderItemId:commitment.orderItemId,quantity:input.quantity,outcome:input.outcome,valueMinor:value.toString()}}});
    await appendAuditLog(tx,{organizationId:tenant.organizationId,branchId:order.branchId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,action:"SALE_RETURN_RECEIVED",entityType:"InventoryMovement",entityId:movement.id,correlationId:key,metadata:{orderId:order.id,customerId:order.customerId,quantity:input.quantity,outcome:input.outcome,valueMinor:value.toString()}});
    return movement;
  };
  return client?run(client):db.$transaction(run,{maxWait:10000,timeout:30000});
}
