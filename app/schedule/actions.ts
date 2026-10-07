"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRouteAccess } from "@/lib/auth/session";
import { saveShift, cancelShift } from "@/lib/staff/shifts";
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
export async function saveShiftAction(form: FormData) {
  let id: string;
  try {
    const fields = Object.fromEntries(["branchId", "assignedMembershipId", "startsAt", "endsAt"].map(key => [key, value(form, key)]));
    id = await saveShift(await requireRouteAccess("/schedule"), { ...fields, ...(value(form, "id") ? { id: value(form, "id"), version: Number(value(form, "version")) } : { creationKey: value(form, "creationKey") }) });
  } catch (error) { unstable_rethrow(error); return { error: error instanceof Error ? error.message : "Не удалось сохранить смену." }; }
  revalidatePath("/schedule", "layout");
  redirect(`/schedule/${id}?saved=1`);
}
export async function cancelShiftAction(form: FormData) {
  let id: string;
  try { id = await cancelShift(await requireRouteAccess("/schedule"), { id: value(form, "id"), version: Number(value(form, "version")) }); }
  catch (error) { unstable_rethrow(error); return { error: error instanceof Error ? error.message : "Не удалось отменить смену." }; }
  revalidatePath("/schedule", "layout");
  redirect(`/schedule/${id}?saved=1`);
}
