"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTextTemplate, transitionTextTemplate } from "@/lib/document-templates/service";

export async function createTemplateAction(form: FormData) {
  const actor = await requireRouteAccess("/settings");
  try {
    await createTextTemplate(actor, { branchId: form.get("branchId") || null, kind: form.get("kind"), body: form.get("body"), baseVersion: Number(form.get("baseVersion")), idempotencyKey: form.get("idempotencyKey") });
  } catch (error) { unstable_rethrow(error); return { error: error instanceof Error ? error.message : "Не удалось сохранить черновик." }; }
  revalidatePath("/settings/document-templates");
  redirect("/settings/document-templates?ok=draft");
}
async function transition(form: FormData, action: "APPROVE" | "ARCHIVE") {
  const actor = await requireRouteAccess("/settings");
  if (form.get("confirmed") !== "yes") return { error: "Подтвердите выбранное действие." };
  try { await transitionTextTemplate(actor, { id: form.get("id"), contentHash: form.get("contentHash") }, action); }
  catch (error) { unstable_rethrow(error); return { error: error instanceof Error ? error.message : "Не удалось изменить статус." }; }
  revalidatePath("/settings/document-templates");
  redirect(`/settings/document-templates?ok=${action === "APPROVE" ? "approved" : "archived"}`);
}
export async function approveTemplateAction(form: FormData) { return transition(form, "APPROVE"); }
export async function archiveTemplateAction(form: FormData) { return transition(form, "ARCHIVE"); }
