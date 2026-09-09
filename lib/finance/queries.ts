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
