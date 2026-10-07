"use server";
import {redirectWithOrderContext} from "@/lib/orders/action-navigation";
import {ZodError} from "zod";
import {unstable_rethrow} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireRouteAccess} from "@/lib/auth/session";
import {getInquiry} from "@/lib/inquiries/service";
import {getFitting} from "@/lib/fittings/service";
import {parseBusinessLocalDateTime} from "@/lib/calendar/timezone";
import {convertToRentalOrder,assignOrder,updateInquirySelection} from "@/lib/workspace/conversion";
const txt=(form:FormData,key:string)=>String(form.get(key)??"").trim();
export async function convertToRentalOrderAction(form:FormData){const source=txt(form,"source"),sourceId=txt(form,"sourceId"),path=source==="FITTING"?"/fittings":"/chats",session=await requireRouteAccess(path);let id:string;try{const row=source==="FITTING"?await getFitting(session,sourceId):await getInquiry(session,sourceId);if(!row)throw new Error("Запись недоступна.");id=await convertToRentalOrder(session,{source,sourceId,customerId:txt(form,"customerId"),assignedMembershipId:txt(form,"assignedMembershipId")||null,rentalStart:parseBusinessLocalDateTime(txt(form,"rentalStart"),row.branch.timezone),rentalEnd:parseBusinessLocalDateTime(txt(form,"rentalEnd"),row.branch.timezone)});}catch(error){unstable_rethrow(error);return {error:error instanceof ZodError?error.issues[0]?.message??"Проверьте поля заказа.":error instanceof Error?error.message:"Не удалось создать заказ."}}revalidatePath("/orders");revalidatePath(path);await redirectWithOrderContext(`/orders/${id}`)}
export async function assignOrderAction(form:FormData){const session=await requireRouteAccess("/orders"),id=txt(form,"orderId");try{await assignOrder(session,id,txt(form,"assignedMembershipId")||null);}catch(error){unstable_rethrow(error);await redirectWithOrderContext(`/orders/${encodeURIComponent(id)}?error=${encodeURIComponent(error instanceof Error?error.message:"Не удалось назначить ответственного.")}`)}revalidatePath("/orders");await redirectWithOrderContext(`/orders/${id}`)}
export async function updateInquirySelectionAction(form:FormData){const session=await requireRouteAccess("/chats"),id=txt(form,"id");try{await updateInquirySelection(session,{id,version:Number(form.get("version")),variantIds:form.getAll("variantIds").map(String)});}catch(error){unstable_rethrow(error);await redirectWithOrderContext(`/chats/${encodeURIComponent(id)}?error=${encodeURIComponent(error instanceof Error?error.message:"Не удалось сохранить подбор.")}`)}revalidatePath("/chats");await redirectWithOrderContext(`/chats/${id}`)}
