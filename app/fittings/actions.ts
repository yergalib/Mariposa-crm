"use server";
import {redirect,unstable_rethrow} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireRouteAccess} from "@/lib/auth/session";
import {db} from "@/lib/db";
import {parseBusinessLocalDateTime} from "@/lib/calendar/timezone";
import {createFitting,updateFitting} from "@/lib/fittings/service";
const txt=(form:FormData,key:string)=>String(form.get(key)??"").trim();
async function input(form:FormData,organizationId:string){const branchId=txt(form,"branchId"),branch=await db.branch.findFirst({where:{id:branchId,organizationId},select:{timezone:true}});if(!branch)throw new Error("Филиал недоступен.");return{branchId,customerId:txt(form,"customerId")||null,inquiryId:txt(form,"inquiryId")||null,guestName:txt(form,"guestName"),guestContact:txt(form,"guestContact"),startsAt:parseBusinessLocalDateTime(txt(form,"startsAt"),branch.timezone),assignedMembershipId:txt(form,"assignedMembershipId"),source:txt(form,"source"),comment:txt(form,"comment"),variantIds:form.getAll("variantIds").map(String)}}
export async function createFittingAction(form:FormData){const session=await requireRouteAccess("/fittings");let id:string;try{id=await createFitting(session,{...await input(form,session.organizationId),creationKey:txt(form,"creationKey")});}catch(error){unstable_rethrow(error);redirect(`/fittings/new?error=${encodeURIComponent(error instanceof Error?error.message:"Не удалось создать примерку.")}`)}revalidatePath("/fittings");revalidatePath("/chats");redirect(`/fittings/${id}`)}
export async function updateFittingAction(form:FormData){const session=await requireRouteAccess("/fittings"),id=txt(form,"id");try{await updateFitting(session,{...await input(form,session.organizationId),id,version:Number(form.get("version")),status:txt(form,"status")});}catch(error){unstable_rethrow(error);redirect(`/fittings/${encodeURIComponent(id)}?error=${encodeURIComponent(error instanceof Error?error.message:"Не удалось сохранить примерку.")}`)}revalidatePath("/fittings");redirect(`/fittings/${id}?ok=1`)}
