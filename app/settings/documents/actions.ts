"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRouteAccess } from "@/lib/auth/session";
import { saveDocumentSettings } from "@/lib/document-settings";
export async function saveDocumentSettingsAction(form: FormData) {
  const actor = await requireRouteAccess("/settings");
  const fields = Object.fromEntries(["branchId", "organizationName", "branchName", "address", "phone", "revision"].map(key => [key, form.get(key)]));
  try { await saveDocumentSettings(actor, fields); }
  catch (error) { unstable_rethrow(error); return { error: error instanceof Error ? error.message : "Не удалось сохранить реквизиты." }; }
  revalidatePath("/settings/documents"); revalidatePath("/settings/business");
  redirect(`/settings/documents?branchId=${fields.branchId}&ok=1`);
}
