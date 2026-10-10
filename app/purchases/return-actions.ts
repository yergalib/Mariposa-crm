"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { returnToSupplier } from "@/lib/purchases/returns";
export async function supplierReturnAction(form:FormData){
 const purchaseId=String(form.get("purchaseId")??"");let error:string|undefined;
 try{const actor=await requireRouteAccess("/purchases/x");await returnToSupplier(createTenantContext(actor.organizationId),{purchaseId,receiptLineId:String(form.get("receiptLineId")??""),locationId:String(form.get("locationId")??""),instanceId:String(form.get("instanceId")??"")||undefined,quantity:Number(form.get("quantity")),reason:String(form.get("reason")??""),idempotencyKey:String(form.get("idempotencyKey")??""),confirmed:form.get("confirmed")==="on"},actor)}catch(e){unstable_rethrow(e);error=e instanceof Error?e.message:"Возврат не выполнен."}
 for(const p of ["/purchases",`/purchases/${purchaseId}`,"/warehouse","/inventory","/warehouse/movements"])revalidatePath(p);
 redirect(`/purchases/${encodeURIComponent(purchaseId)}?${new URLSearchParams(error?{error}:{ok:"Товар передан поставщику. Денежный расчёт этой операцией не записывался."})}`);
}
