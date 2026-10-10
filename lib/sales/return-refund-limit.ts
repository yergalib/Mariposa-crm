import type { Prisma } from "@/generated/prisma/client";
import { FinanceError } from "@/lib/finance/errors";
/** Called inside the existing order-finance lock, after idempotent replay. */
export async function getSaleReturnRefundAllowance(tx:Prisma.TransactionClient,organizationId:string,orderId:string){
  const order=await tx.order.findFirst({where:{id:orderId,organizationId},select:{type:true,status:true}});
  if(order?.type!=="SALE"||order.status!=="COMPLETED")return null;
  const credit=(await tx.inventoryMovement.aggregate({where:{organizationId,type:"SALE_RETURN",saleInventoryCommitment:{orderId}},_sum:{saleReturnValueMinor:true}}))._sum.saleReturnValueMinor??BigInt(0);
  const refunded=(await tx.financialTransaction.aggregate({where:{organizationId,orderId,OR:[{kind:"CUSTOMER_REFUND"},{kind:"REVERSAL",reversalOf:{kind:"CUSTOMER_REFUND"}}]},_sum:{cashEffectMinor:true}}))._sum.cashEffectMinor??BigInt(0);
  return credit+refunded>BigInt(0)?credit+refunded:BigInt(0);
}
export async function assertSaleReturnRefundLimit(tx:Prisma.TransactionClient,organizationId:string,orderId:string,amount:bigint){
  const available=await getSaleReturnRefundAllowance(tx,organizationId,orderId);
  if(available!==null&&amount>available)throw new FinanceError("INVALID","Сумма превышает стоимость принятого товара за вычетом уже возвращённых денег. Сначала оформите физический возврат продажи.");
}
