import "server-only";
import { z } from "zod";
import { Prisma, type Order } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { workflowScope, permits, validateWorkflowAssignee } from "@/lib/workflow-access";
import { appendAuditLog } from "@/lib/audit/log";
import { getInquiry } from "@/lib/inquiries/service";
import { workflowOptions } from "@/lib/workspace/conversion";
import { quoteSaleVariant } from "@/lib/sales/mobile";
import { createTenantContext } from "@/lib/tenant/context";
import { OrderError } from "@/lib/orders/errors";

import { isPurchaseInquiry } from '@/lib/inquiries/purchase-intent';
const keys = ['LEAD_VIEW','LEAD_CONVERT_TO_ORDER','ORDER_VIEW','ORDER_CREATE','SALE_CONFIRM','CUSTOMER_VIEW','CATALOG_VIEW','INVENTORY_VIEW'] as const;
const schema=z.object({inquiryId:z.string().uuid(),version:z.number().int().positive(),branchId:z.string().uuid(),customerId:z.string().uuid(),assignedMembershipId:z.string().uuid()});
export async function inquirySalePrefill(actor:AuthContext,id:string){
 z.string().uuid().parse(id);const inquiry=await getInquiry(actor,id);
 if(!inquiry)throw new OrderError('NOT_FOUND','Обращение недоступно.');
 await db.$transaction(tx=>workflowScope(tx,actor,[...keys],inquiry.branchId));
 if(!isPurchaseInquiry(inquiry))throw new OrderError('INVALID_STATE','Это не заявка на покупку.');
 if(inquiry.orderId){const existing=await db.order.findFirst({where:{id:inquiry.orderId,organizationId:actor.organizationId,branchId:inquiry.branchId,type:'SALE'},select:{id:true}});if(!existing)throw new OrderError('NOT_FOUND','Связанная продажа недоступна.');return {inquiry,existingOrderId:existing.id,options:{members:[]},quotes:[],excluded:[],assignedMembershipId:actor.membershipId};}
 if(inquiry.status==='CLOSED')throw new OrderError('INVALID_STATE','Обращение закрыто.');
 const options=await workflowOptions(actor,'ORDER_VIEW',inquiry.branchId),quotes=[],excluded=[];
 for(const item of inquiry.items){const quote=await quoteSaleVariant(createTenantContext(actor.organizationId),inquiry.branchId,item.productVariantId);if(quote)quotes.push(quote);else excluded.push(`${item.nameSnapshot} · ${item.sizeSnapshot}`);}
 return {inquiry,existingOrderId:null,options,quotes,excluded,assignedMembershipId:options.members.some(m=>m.id===inquiry.assignedMembershipId)?inquiry.assignedMembershipId!:actor.membershipId};
}
// Same source lock as rental and fitting conversions. Callback is the existing SALE command.
export async function withInquirySale(actor:AuthContext,raw:unknown,run:(tx:Prisma.TransactionClient,context:{key:string;source:string})=>Promise<Order>){
 const input=schema.parse(raw);return db.$transaction(async tx=>{
  const {where,member}=await workflowScope(tx,actor,[...keys],input.branchId);
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`conversion:${actor.organizationId}:INQUIRY:${input.inquiryId}`},0))`);
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`inquiry-conversion:${actor.organizationId}:${input.inquiryId}`},0))`);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM inquiries WHERE id=${input.inquiryId}::uuid AND organization_id=${actor.organizationId}::uuid FOR UPDATE`);
  const inquiry=await tx.inquiry.findFirst({where:{...where,id:input.inquiryId,branchId:input.branchId}});
  if(!inquiry||!isPurchaseInquiry(inquiry))throw new OrderError('NOT_FOUND','Заявка на покупку недоступна.');
  const key=`inquiry-sale:${inquiry.id}`;
  if(inquiry.orderId){const order=await tx.order.findFirst({where:{...where,id:inquiry.orderId}});if(!order||order.type!=='SALE'||order.creationIdempotencyKey!==key||order.customerId!==input.customerId||order.assignedMembershipId!==input.assignedMembershipId)throw new OrderError('INVALID_STATE','Заказ уже создан с другими условиями. Откройте связанный заказ.');}
  else {if(inquiry.status==='CLOSED'||inquiry.version!==input.version)throw new OrderError('INVALID_STATE','Обращение изменилось или закрыто. Откройте его заново.');if(input.assignedMembershipId!==actor.membershipId&&!permits(member,'ORDER_ASSIGN'))throw new OrderError('FORBIDDEN','Нет права назначить другого ответственного.');await validateWorkflowAssignee(tx,actor,inquiry.branchId,input.assignedMembershipId,['ORDER_VIEW','ORDER_EDIT']);}
  const order=await run(tx,{key,source:inquiry.source==='TELEGRAM'?'OTHER':inquiry.source});
  if(inquiry.orderId)return order;
  await tx.order.update({where:{id:order.id},data:{assignedMembershipId:input.assignedMembershipId}});
  await tx.inquiry.update({where:{id:inquiry.id},data:{orderId:order.id,customerId:input.customerId,status:'ORDER',version:{increment:1}}});
  await appendAuditLog(tx,{organizationId:actor.organizationId,branchId:inquiry.branchId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,action:'SOURCE_CONVERTED_TO_ORDER',entityType:'Inquiry',entityId:inquiry.id,metadata:{orderId:order.id,orderType:'SALE',assignedMembershipId:input.assignedMembershipId}});
  return order;
 },{maxWait:10000,timeout:60000});
}
export async function linkedSaleInquiry(actor:AuthContext,orderId:string){
 return db.$transaction(async tx=>{const {where}=await workflowScope(tx,actor,['LEAD_VIEW']);return tx.inquiry.findFirst({where:{...where,orderId},select:{id:true}})});
}
