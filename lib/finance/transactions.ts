import "server-only";
import type { FinancialTransactionKind, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import type { AuthContext } from "@/lib/auth/session";
import type { PermissionKey } from "@/lib/permissions/registry";
import { requirePermission } from "@/lib/permissions/effective";
import { requireUserBranchAccess } from "@/lib/staff/branch-access";
import { appendAuditLog } from "@/lib/audit/log";
import { effectsFor, type FinancialEffects } from "@/lib/finance/effects";
import { FinanceError } from "@/lib/finance/errors";

type Actor=Pick<AuthContext,"userId"|"membershipId"|"role">;
type Base={branchId:string;customerId?:string;orderId?:string;amountMinor:bigint;currency:string;paymentMethodId?:string;sourceType:string;sourceId?:string;idempotencyKey:string;reason?:string;occurredAt?:Date};
const CASH_KINDS=new Set<FinancialTransactionKind>(["PAYMENT_RECEIVED","CUSTOMER_REFUND","DEPOSIT_RECEIVED","DEPOSIT_REFUNDED"]);
function clean(input:Base){
  if(input.amountMinor<=BigInt(0))throw new FinanceError("INVALID","Сумма должна быть больше нуля.");
  const currency=input.currency.trim().toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new FinanceError("INVALID","Некорректная валюта.");
  const sourceType=input.sourceType.trim();const idempotencyKey=input.idempotencyKey.trim();const reason=input.reason?.trim();
  if(!sourceType||sourceType.length>80||!idempotencyKey||idempotencyKey.length>150||reason&&reason.length>500)throw new FinanceError("INVALID","Некорректные реквизиты финансовой операции.");
  return{...input,currency,sourceType,idempotencyKey,reason:reason||undefined};
}
async function permission(actor:Actor,organizationId:string,key:PermissionKey){await requirePermission({organizationId,membershipId:actor.membershipId,role:actor.role},key)}
async function context(tx:Prisma.TransactionClient,tenant:TenantContext,input:ReturnType<typeof clean>,actor:Actor){
  await requireUserBranchAccess(tx,tenant,actor.userId,input.branchId);
  const order=input.orderId?await tx.order.findFirst({where:{id:input.orderId,organizationId:tenant.organizationId},select:{id:true,branchId:true,customerId:true,currency:true}}):null;
  if(input.orderId&&!order)throw new FinanceError("NOT_FOUND","Заказ не найден.");
  if(order&&(order.branchId!==input.branchId||order.currency!==input.currency||input.customerId&&order.customerId!==input.customerId))throw new FinanceError("NOT_FOUND","Финансовый объект недоступен.");
  const customerId=input.customerId??order?.customerId;
  if(!customerId||!await tx.customer.findFirst({where:{id:customerId,organizationId:tenant.organizationId},select:{id:true}}))throw new FinanceError("NOT_FOUND","Клиент не найден.");
  return{order,customerId};
}
async function method(tx:Prisma.TransactionClient,organizationId:string,id:string|undefined,required:boolean,allowInactive=false){
  if(!required){if(id)throw new FinanceError("INVALID","Способ оплаты допустим только для движения денег.");return null;}
  if(!id)throw new FinanceError("INVALID","Укажите способ оплаты.");
  const row=await tx.paymentMethod.findFirst({where:{id,organizationId,...allowInactive?{}:{isActive:true}},select:{id:true,code:true}});if(!row)throw new FinanceError("NOT_FOUND","Способ оплаты недоступен.");return row;
}
function sameSemanticPayload(existing:Awaited<ReturnType<Prisma.TransactionClient["financialTransaction"]["findUnique"]>>,expected:{kind:FinancialTransactionKind;organizationId:string;branchId:string;customerId:string;orderId?:string;amountMinor:bigint;currency:string;paymentMethodId?:string;relatedTransactionId?:string;reversalOfId?:string;sourceType:string;sourceId?:string;reason?:string;occurredAt?:Date}){
  return Boolean(existing&&existing.organizationId===expected.organizationId&&existing.kind===expected.kind&&existing.branchId===expected.branchId&&existing.customerId===expected.customerId&&existing.orderId===(expected.orderId??null)&&existing.amountMinor===expected.amountMinor&&existing.currency===expected.currency&&existing.paymentMethodId===(expected.paymentMethodId??null)&&existing.relatedTransactionId===(expected.relatedTransactionId??null)&&existing.reversalOfId===(expected.reversalOfId??null)&&existing.sourceType===expected.sourceType&&existing.sourceId===(expected.sourceId??null)&&existing.reason===(expected.reason??null)&&(!expected.occurredAt||existing.occurredAt.getTime()===expected.occurredAt.getTime()));
}
function replayOrConflict(existing:Awaited<ReturnType<Prisma.TransactionClient["financialTransaction"]["findUnique"]>>,expected:Parameters<typeof sameSemanticPayload>[1]){if(!sameSemanticPayload(existing,expected))throw new FinanceError("CONFLICT","Ключ повторной операции уже использован с другими данными.");return existing!;}
export async function createFinancialTransactionWithClient(tx:Prisma.TransactionClient,tenant:TenantContext,kind:FinancialTransactionKind,input:ReturnType<typeof clean>,actor:Actor,effects:FinancialEffects,relatedTransactionId?:string,reversalOfId?:string,allowInactiveMethod=false){
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenant.organizationId+":finance:"+input.idempotencyKey},0))`;
  const resolved=await context(tx,tenant,input,actor);
  const existing=await tx.financialTransaction.findUnique({where:{organizationId_idempotencyKey:{organizationId:tenant.organizationId,idempotencyKey:input.idempotencyKey}}});
  if(existing)return replayOrConflict(existing,{kind,organizationId:tenant.organizationId,branchId:input.branchId,customerId:resolved.customerId,orderId:input.orderId,amountMinor:input.amountMinor,currency:input.currency,paymentMethodId:input.paymentMethodId,relatedTransactionId,reversalOfId,sourceType:input.sourceType,sourceId:input.sourceId,reason:input.reason,occurredAt:input.occurredAt});
  const paymentMethod=await method(tx,tenant.organizationId,input.paymentMethodId,CASH_KINDS.has(kind)||effects.cashEffectMinor!==BigInt(0),allowInactiveMethod);
  const row=await tx.financialTransaction.create({data:{organizationId:tenant.organizationId,branchId:input.branchId,customerId:resolved.customerId,orderId:input.orderId,kind,amountMinor:input.amountMinor,...effects,currency:input.currency,paymentMethodId:paymentMethod?.id,relatedTransactionId,reversalOfId,sourceType:input.sourceType,sourceId:input.sourceId,idempotencyKey:input.idempotencyKey,reason:input.reason,occurredAt:input.occurredAt,actorUserId:actor.userId,actorMembershipId:actor.membershipId}});
  await appendAuditLog(tx,{organizationId:tenant.organizationId,branchId:input.branchId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,action:"FINANCIAL_TRANSACTION_POSTED",entityType:"FinancialTransaction",entityId:row.id,metadata:{kind,amountMinor:input.amountMinor.toString(),currency:input.currency,paymentMethodCode:paymentMethod?.code??null,sourceType:input.sourceType,relatedTransactionId:relatedTransactionId??null}});
  return row;
}
async function post(tenant:TenantContext,kind:Exclude<FinancialTransactionKind,"REVERSAL">,input:Base,actor:Actor,key:PermissionKey){await permission(actor,tenant.organizationId,key);const value=clean(input);return db.$transaction(tx=>createFinancialTransactionWithClient(tx,tenant,kind,value,actor,effectsFor(kind,value.amountMinor)),{timeout:20000});}
export function postCharge(tenant:TenantContext,kind:"RENTAL_CHARGE"|"SALE_CHARGE"|"DAMAGE_CHARGE"|"DISCOUNT",input:Base,actor:Actor){return post(tenant,kind,input,actor,"PAYMENT_CREATE")}
export function postPayment(tenant:TenantContext,input:Base,actor:Actor){return post(tenant,"PAYMENT_RECEIVED",input,actor,"PAYMENT_CREATE")}
export function receiveDeposit(tenant:TenantContext,input:Base,actor:Actor){return post(tenant,"DEPOSIT_RECEIVED",input,actor,"DEPOSIT_MANAGE")}
async function relatedOperation(tenant:TenantContext,kind:"CUSTOMER_REFUND"|"DEPOSIT_REFUNDED"|"DEPOSIT_WITHHELD",originalId:string,input:Base,actor:Actor,key:PermissionKey){
  await permission(actor,tenant.organizationId,key);const value=clean(input);
  return db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenant.organizationId+":financial-source:"+originalId},0))`;
    const original=await tx.financialTransaction.findFirst({where:{id:originalId,organizationId:tenant.organizationId},include:{reversal:{select:{id:true}}}});if(!original||original.reversal)throw new FinanceError("NOT_FOUND","Исходная финансовая операция недоступна.");
    const expected=kind==="CUSTOMER_REFUND"?"PAYMENT_RECEIVED":"DEPOSIT_RECEIVED";if(original.kind!==expected||original.branchId!==value.branchId||original.orderId!==(value.orderId??null)||original.customerId!==(value.customerId??original.customerId)||original.currency!==value.currency)throw new FinanceError("INVALID","Исходная операция не соответствует возврату.");
    const canonical={...value,paymentMethodId:kind==="DEPOSIT_WITHHELD"?undefined:original.paymentMethodId??undefined,customerId:original.customerId??undefined};
    const resolved=await context(tx,tenant,canonical,actor),replay=await tx.financialTransaction.findUnique({where:{organizationId_idempotencyKey:{organizationId:tenant.organizationId,idempotencyKey:value.idempotencyKey}}});
    if(replay)return replayOrConflict(replay,{kind,organizationId:tenant.organizationId,branchId:value.branchId,customerId:resolved.customerId,orderId:value.orderId,amountMinor:value.amountMinor,currency:value.currency,paymentMethodId:canonical.paymentMethodId,relatedTransactionId:original.id,sourceType:value.sourceType,sourceId:value.sourceId,reason:value.reason,occurredAt:value.occurredAt});
    const related=await tx.financialTransaction.aggregate({where:{organizationId:tenant.organizationId,relatedTransactionId:original.id},_sum:{cashEffectMinor:true,depositEffectMinor:true}});
    const available=kind==="CUSTOMER_REFUND"?original.cashEffectMinor+(related._sum.cashEffectMinor??BigInt(0)):original.depositEffectMinor+(related._sum.depositEffectMinor??BigInt(0));
    if(value.amountMinor>available)throw new FinanceError("INVALID",kind==="CUSTOMER_REFUND"?"Сумма возврата превышает доступную.":"Сумма превышает удерживаемый залог.");
    return createFinancialTransactionWithClient(tx,tenant,kind,canonical,actor,effectsFor(kind,value.amountMinor),original.id,undefined,true);
  },{timeout:20000});
}
export function refundPayment(t:TenantContext,originalId:string,input:Base,actor:Actor){return relatedOperation(t,"CUSTOMER_REFUND",originalId,input,actor,"PAYMENT_REFUND")}
export function refundDeposit(t:TenantContext,originalId:string,input:Base,actor:Actor){return relatedOperation(t,"DEPOSIT_REFUNDED",originalId,input,actor,"DEPOSIT_REFUND")}
export function withholdDeposit(t:TenantContext,originalId:string,input:Base,actor:Actor){return relatedOperation(t,"DEPOSIT_WITHHELD",originalId,input,actor,"DEPOSIT_MANAGE")}
export async function reverseFinancialTransaction(tenant:TenantContext,originalId:string,input:Omit<Base,"amountMinor"|"currency"|"paymentMethodId">,actor:Actor){
  await permission(actor,tenant.organizationId,"PAYMENT_REVERSE");if(!input.reason?.trim())throw new FinanceError("INVALID","Для исправления укажите причину.");
  return db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenant.organizationId+":financial-reversal:"+originalId},0))`;
    const original=await tx.financialTransaction.findFirst({where:{id:originalId,organizationId:tenant.organizationId},include:{reversal:{select:{id:true}}}});if(!original||original.kind==="REVERSAL")throw new FinanceError("CONFLICT","Операция уже исправлена или недоступна.");
    const value=clean({...input,branchId:input.branchId,customerId:input.customerId??original.customerId??undefined,orderId:input.orderId??original.orderId??undefined,amountMinor:original.amountMinor,currency:original.currency,paymentMethodId:original.paymentMethodId??undefined});
    const resolved=await context(tx,tenant,value,actor),replay=await tx.financialTransaction.findUnique({where:{organizationId_idempotencyKey:{organizationId:tenant.organizationId,idempotencyKey:value.idempotencyKey}}});
    if(replay)return replayOrConflict(replay,{kind:"REVERSAL",organizationId:tenant.organizationId,branchId:value.branchId,customerId:resolved.customerId,orderId:value.orderId,amountMinor:value.amountMinor,currency:value.currency,paymentMethodId:value.paymentMethodId,relatedTransactionId:original.relatedTransactionId??undefined,reversalOfId:original.id,sourceType:value.sourceType,sourceId:value.sourceId,reason:value.reason,occurredAt:value.occurredAt});
    if(original.reversal)throw new FinanceError("CONFLICT","Операция уже исправлена или недоступна.");
    const dependent=await tx.financialTransaction.aggregate({where:{organizationId:tenant.organizationId,relatedTransactionId:original.id},_sum:{obligationEffectMinor:true,cashEffectMinor:true,revenueEffectMinor:true,depositEffectMinor:true}}),zero=BigInt(0);
    if((dependent._sum.obligationEffectMinor??zero)!==zero||(dependent._sum.cashEffectMinor??zero)!==zero||(dependent._sum.revenueEffectMinor??zero)!==zero||(dependent._sum.depositEffectMinor??zero)!==zero)throw new FinanceError("CONFLICT","Сначала исправьте связанные возвраты или удержания.");
    return createFinancialTransactionWithClient(tx,tenant,"REVERSAL",value,actor,{obligationEffectMinor:-original.obligationEffectMinor,cashEffectMinor:-original.cashEffectMinor,revenueEffectMinor:-original.revenueEffectMinor,depositEffectMinor:-original.depositEffectMinor},original.relatedTransactionId??undefined,original.id,true);
  },{timeout:20000});
}
