"use server";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { recordSaleReturn } from "@/lib/sales/returns";
import { redirectWithOrderContext } from "@/lib/orders/action-navigation";
export async function saleReturnAction(form:FormData){
  const orderId=String(form.get("orderId")??"");
  let error:string|undefined;
  try{
    const actor=await requireRouteAccess("/orders");
    await recordSaleReturn(createTenantContext(actor.organizationId),{orderId,commitmentId:String(form.get("commitmentId")??""),quantity:Number(form.get("quantity")),locationId:String(form.get("locationId")??""),outcome:String(form.get("outcome")??""),reason:String(form.get("reason")??""),idempotencyKey:String(form.get("idempotencyKey")??""),confirmed:form.get("confirmed")==="on"},actor);
  }catch(e){unstable_rethrow(e);error=e instanceof Error?e.message:"Возврат не выполнен.";}
  for(const path of ["/orders","/inventory","/warehouse","/returns","/cash","/finance",`/orders/${orderId}`])revalidatePath(path);
  await redirectWithOrderContext(`/orders/${encodeURIComponent(orderId)}?${new URLSearchParams(error?{error}:{ok:"Товар принят. Корректировка стоимости записана; деньги автоматически не выдавались."})}`);
}
