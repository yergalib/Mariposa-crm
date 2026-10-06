"use server";
import {redirect,unstable_rethrow} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireRouteAccess} from "@/lib/auth/session";
import {saveBusinessSetting} from "@/lib/settings-business";
export async function saveBusinessSettingAction(form:FormData){
  const session=await requireRouteAccess("/settings/business");
  try{const raw=Object.fromEntries(form.entries());await saveBusinessSetting(session,{...raw,id:raw.id||undefined,isActive:raw.isActive==="on"});revalidatePath("/settings/business");}
  catch(error){unstable_rethrow(error);redirect(`/settings/business?error=${encodeURIComponent(error instanceof Error?error.message:"Не удалось сохранить настройки.")}`)}
  redirect("/settings/business?ok=1");
}
