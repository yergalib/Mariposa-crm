import "server-only";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import type { AuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { requireBranchAccess } from "@/lib/staff/branch-access";
import { FinanceError } from "@/lib/finance/errors";
type Actor=Pick<AuthContext,"membershipId"|"role">;
export async function getOrderFinancialSummary(tenant:TenantContext,orderId:string,actor:Actor){
  await requirePermission({organizationId:tenant.organizationId,...actor},"PAYMENT_VIEW");const order=await db.order.findFirst({where:{id:orderId,organizationId:tenant.organizationId},select:{branchId:true,currency:true}});if(!order)throw new FinanceError("NOT_FOUND","Заказ не найден.");await requireBranchAccess(tenant,actor.membershipId,order.branchId);
  const a=await db.financialTransaction.aggregate({where:{organizationId:tenant.organizationId,orderId,currency:order.currency},_sum:{obligationEffectMinor:true,revenueEffectMinor:true,cashEffectMinor:true,depositEffectMinor:true}}),obligation=a._sum.obligationEffectMinor??BigInt(0),revenue=a._sum.revenueEffectMinor??BigInt(0);
  return{currency:order.currency,paidMinor:revenue-obligation,outstandingMinor:obligation,heldDepositMinor:a._sum.depositEffectMinor??BigInt(0),cashMovementMinor:a._sum.cashEffectMinor??BigInt(0),revenueMinor:revenue};
}
export async function getCustomerOutstandingBalance(tenant:TenantContext,customerId:string,currency:string,actor:Actor){await requirePermission({organizationId:tenant.organizationId,...actor},"CUSTOMER_BALANCE_VIEW");const exists=await db.customer.findFirst({where:{id:customerId,organizationId:tenant.organizationId},select:{id:true}});if(!exists)throw new FinanceError("NOT_FOUND","Клиент не найден.");const x=await db.financialTransaction.aggregate({where:{organizationId:tenant.organizationId,customerId,currency:currency.toUpperCase()},_sum:{obligationEffectMinor:true}});return x._sum.obligationEffectMinor??BigInt(0);}
export async function getPaymentMethodTotals(tenant:TenantContext,branchId:string,currency:string,actor:Actor){await requirePermission({organizationId:tenant.organizationId,...actor},"PAYMENT_VIEW");await requireBranchAccess(tenant,actor.membershipId,branchId);const rows=await db.financialTransaction.groupBy({by:["paymentMethodId"],where:{organizationId:tenant.organizationId,branchId,currency:currency.toUpperCase(),paymentMethodId:{not:null}},_sum:{cashEffectMinor:true}});return rows.map(x=>({paymentMethodId:x.paymentMethodId!,netCashMinor:x._sum.cashEffectMinor??BigInt(0)}));}

export type OrderPaymentStatus="UNPAID"|"PARTIAL"|"PAID";
export function deriveOrderPaymentStatus(paidMinor:bigint,outstandingMinor:bigint):OrderPaymentStatus{
  if(outstandingMinor<=BigInt(0))return"PAID";
  return paidMinor>BigInt(0)?"PARTIAL":"UNPAID";
}

export async function getOrderPaymentDetails(tenant:TenantContext,orderId:string,actor:Actor){
  await requirePermission({organizationId:tenant.organizationId,...actor},"PAYMENT_VIEW");
  const order=await db.order.findFirst({where:{id:orderId,organizationId:tenant.organizationId},select:{id:true,branchId:true,currency:true,totalMinor:true}});
  if(!order)throw new FinanceError("NOT_FOUND","Заказ не найден.");
  await requireBranchAccess(tenant,actor.membershipId,order.branchId);
  const [aggregate,transactions,paymentMethods]=await Promise.all([
    db.financialTransaction.aggregate({where:{organizationId:tenant.organizationId,orderId,currency:order.currency},_sum:{obligationEffectMinor:true,revenueEffectMinor:true,cashEffectMinor:true,depositEffectMinor:true}}),
    db.financialTransaction.findMany({
      where:{organizationId:tenant.organizationId,orderId,kind:{in:["PAYMENT_RECEIVED","CUSTOMER_REFUND","REVERSAL"]}},
      select:{id:true,kind:true,amountMinor:true,currency:true,cashEffectMinor:true,occurredAt:true,reason:true,paymentMethod:{select:{displayName:true}},actorUser:{select:{displayName:true,firstName:true,lastName:true}},reversal:{select:{id:true}},reversalOf:{select:{kind:true}},relatedTransactionId:true},
      orderBy:[{occurredAt:"desc"},{createdAt:"desc"}],take:100,
    }),
    db.paymentMethod.findMany({where:{organizationId:tenant.organizationId,isActive:true},select:{id:true,displayName:true},orderBy:[{sortOrder:"asc"},{displayName:"asc"}]})
  ]);
  const obligation=aggregate._sum.obligationEffectMinor??BigInt(0),revenue=aggregate._sum.revenueEffectMinor??BigInt(0),paid=revenue-obligation;
  const payments=transactions.filter(x=>x.kind==="PAYMENT_RECEIVED").map(payment=>{
    const related=transactions.filter(x=>x.relatedTransactionId===payment.id).reduce((sum,x)=>sum+x.cashEffectMinor,BigInt(0));
    return{...payment,refundableMinor:payment.reversal?BigInt(0):payment.amountMinor+related};
  });
  return{
    orderTotalMinor:order.totalMinor,currency:order.currency,paidMinor:paid,outstandingMinor:obligation,
    status:deriveOrderPaymentStatus(paid,obligation),paymentMethods,transactions,payments,
  };
}

export async function getOrderDepositDetails(tenant:TenantContext,orderId:string,actor:Actor){
  await requirePermission({organizationId:tenant.organizationId,...actor},"DEPOSIT_VIEW");
  const order=await db.order.findFirst({where:{id:orderId,organizationId:tenant.organizationId},select:{id:true,branchId:true,currency:true,depositRequiredMinor:true,status:true}});
  if(!order)throw new FinanceError("NOT_FOUND","Заказ не найден.");
  await requireBranchAccess(tenant,actor.membershipId,order.branchId);
  const [transactions,paymentMethods,issued,heldAggregate,receivedAggregate]=await Promise.all([
    db.financialTransaction.findMany({
      where:{organizationId:tenant.organizationId,orderId,currency:order.currency,OR:[{kind:{in:["DEPOSIT_RECEIVED","DEPOSIT_REFUNDED","DEPOSIT_WITHHELD"]}},{kind:"REVERSAL",reversalOf:{kind:{in:["DEPOSIT_RECEIVED","DEPOSIT_REFUNDED","DEPOSIT_WITHHELD"]}}}]},
      select:{id:true,kind:true,amountMinor:true,currency:true,depositEffectMinor:true,cashEffectMinor:true,occurredAt:true,reason:true,relatedTransactionId:true,paymentMethod:{select:{displayName:true}},actorUser:{select:{displayName:true,firstName:true,lastName:true}},reversalOf:{select:{kind:true}}},
      orderBy:[{occurredAt:"desc"},{createdAt:"desc"}],take:100,
    }),
    db.paymentMethod.findMany({where:{organizationId:tenant.organizationId,isActive:true},select:{id:true,displayName:true},orderBy:[{sortOrder:"asc"},{displayName:"asc"}]}),
    db.capacityAllocation.aggregate({where:{organizationId:tenant.organizationId,orderId,issuedAt:{not:null}},_sum:{issuedQuantity:true,returnedQuantity:true}}),
    db.financialTransaction.aggregate({where:{organizationId:tenant.organizationId,orderId,currency:order.currency},_sum:{depositEffectMinor:true}}),
    db.financialTransaction.aggregate({where:{organizationId:tenant.organizationId,orderId,currency:order.currency,OR:[{kind:"DEPOSIT_RECEIVED"},{kind:"REVERSAL",reversalOf:{kind:"DEPOSIT_RECEIVED"}}]},_sum:{depositEffectMinor:true}}),
  ]);
  const heldDepositMinor=heldAggregate._sum.depositEffectMinor??BigInt(0);
  const totalDepositReceivedMinor=receivedAggregate._sum.depositEffectMinor??BigInt(0);
  const depositShortageMinor=order.depositRequiredMinor>heldDepositMinor?order.depositRequiredMinor-heldDepositMinor:BigInt(0);
  const issuedQuantity=issued._sum.issuedQuantity??0,returnedQuantity=issued._sum.returnedQuantity??0;
  const refundEligible=order.status==="CONFIRMED"&&(issuedQuantity===0||issuedQuantity===returnedQuantity)||order.status==="COMPLETED"&&issuedQuantity>0&&issuedQuantity===returnedQuantity;
  return{requiredDepositMinor:order.depositRequiredMinor,totalDepositReceivedMinor,heldDepositMinor,depositShortageMinor,refundableDepositMinor:heldDepositMinor>BigInt(0)?heldDepositMinor:BigInt(0),currency:order.currency,paymentMethods,transactions,refundEligible};
}
