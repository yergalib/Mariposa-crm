import "server-only";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";

export const DEFAULT_PAYMENT_METHODS=[
  {code:"CASH",displayName:"Наличные",sortOrder:10},{code:"KASPI",displayName:"Kaspi",sortOrder:20},
  {code:"BANK_CARD",displayName:"Банковская карта",sortOrder:30},{code:"BANK_TRANSFER",displayName:"Банковский перевод",sortOrder:40},
  {code:"OTHER",displayName:"Другое",sortOrder:100}
] as const;
export async function ensureDefaultPaymentMethods(tenant:TenantContext){
  await db.paymentMethod.createMany({data:DEFAULT_PAYMENT_METHODS.map(x=>({...x,organizationId:tenant.organizationId})),skipDuplicates:true});
  return db.paymentMethod.findMany({where:{organizationId:tenant.organizationId},orderBy:[{sortOrder:"asc"},{displayName:"asc"}],select:{id:true,code:true,displayName:true,isActive:true}});
}
