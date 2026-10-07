"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRouteAccess } from "@/lib/auth/session";
import { savePermissionRole, assignPermissionRole } from "@/lib/permissions/roles";
const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
export async function saveRoleAction(f: FormData) {
  try {
    const actor = await requireRouteAccess("/settings/staff/roles");
    await savePermissionRole(actor, { id: text(f, "id") || undefined, version: Number(text(f, "version")) || undefined, name: text(f, "name"), permissionKeys: f.getAll("permissionKey").map(String) });
  } catch (error) { unstable_rethrow(error); redirect(`/settings/staff/roles?error=${encodeURIComponent(error instanceof Error ? error.message : "Не удалось сохранить набор.")}`); }
  revalidatePath("/settings/staff");
  redirect("/settings/staff/roles?saved=1");
}
export async function assignRoleAction(f: FormData) {
  try {
    const actor = await requireRouteAccess("/settings/staff/roles");
    await assignPermissionRole(actor, text(f, "membershipId"), text(f, "roleId"), text(f, "expectedRoleId") || null);
  } catch (error) { unstable_rethrow(error); redirect(`/settings/staff/roles?error=${encodeURIComponent(error instanceof Error ? error.message : "Не удалось назначить набор.")}`); }
  revalidatePath("/settings/staff");
  redirect("/settings/staff/roles?saved=1");
}
