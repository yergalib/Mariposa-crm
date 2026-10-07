"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRouteAccess } from "@/lib/auth/session";
import { setCashOpening, createCashExpense, transferCash, correctCashMovement, saveExpenseCategory } from "@/lib/finance/cash-accounts";
const value = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
async function perform(form: FormData, command: (actor: Awaited<ReturnType<typeof requireRouteAccess>>, input: unknown) => Promise<string>, extra: Record<string, unknown>) {
  const actor = await requireRouteAccess("/cash/accounts");
  try {
    await command(actor, { ...Object.fromEntries(form.entries()), ...extra, confirmed: value(form, "confirmed") === "yes" });
    revalidatePath("/cash"); revalidatePath("/cash/accounts"); revalidatePath("/finance");
  } catch (error) { unstable_rethrow(error); return { error: error instanceof Error ? error.message : "Операция не сохранена." }; }
  const branchId = value(form, "returnBranchId");
  redirect(`/cash/accounts?${new URLSearchParams({ saved: "1", ...(branchId ? { branchId } : {}) })}`);
}
export async function cashOpeningAction(f: FormData) { return perform(f, setCashOpening, { replacesOpeningId: value(f, "replacesOpeningId") || undefined }); }
export async function cashExpenseAction(f: FormData) { return perform(f, createCashExpense, {}); }
export async function cashTransferAction(f: FormData) { return perform(f, transferCash, {}); }
export async function cashCorrectionAction(f: FormData) { return perform(f, correctCashMovement, {}); }
export async function cashCategoryAction(f: FormData) { return perform(f, saveExpenseCategory, { id: value(f, "id") || undefined, version: Number(value(f, "version")) || undefined, isActive: value(f, "isActive") === "yes" }); }
