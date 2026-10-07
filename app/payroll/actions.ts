"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireRouteAccess } from "@/lib/auth/session";
import { submitClaim, saveRate, confirmClaimAndPayment, rejectClaim, manualPayroll, correctPayroll } from "@/lib/payroll/service";
const values = (form: FormData) => Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
type Operation = "rate" | "confirm" | "reject" | "manual" | "correct";
async function act(form: FormData, operation: Operation) {
  const input = values(form);
  try {
    const actor = await requireRouteAccess("/payroll");
    if (operation === "rate") await saveRate(actor, { ...input, version: Number(input.version) });
    if (operation === "confirm") await confirmClaimAndPayment(actor, { ...input, version: Number(input.version), rateVersion: Number(input.rateVersion) });
    if (operation === "reject") await rejectClaim(actor, { ...input, version: Number(input.version) });
    if (operation === "manual") await manualPayroll(actor, { ...input, paymentMethodId: input.paymentMethodId || undefined });
    if (operation === "correct") await correctPayroll(actor, input);
  } catch (error) { unstable_rethrow(error); return { error: error instanceof ZodError ? "Проверьте обязательные поля, сумму и подтверждение." : error instanceof Error ? error.message : "Не удалось сохранить операцию." }; }
  revalidatePath("/payroll"); revalidatePath("/my-shifts");
  const query = new URLSearchParams({ saved: "1" });
  if (input.branchId) query.set("branchId", input.branchId);
  if (input.employeeMembershipId) query.set("employeeMembershipId", input.employeeMembershipId);
  redirect(`/payroll?${query}`);
}
export async function rateAction(form: FormData) { return act(form, "rate"); }
export async function confirmPayrollAction(form: FormData) { return act(form, "confirm"); }
export async function rejectPayrollAction(form: FormData) { return act(form, "reject"); }
export async function manualPayrollAction(form: FormData) { return act(form, "manual"); }
export async function correctPayrollAction(form: FormData) { return act(form, "correct"); }
export async function submitOwnShiftAction(form: FormData) {
  try { await submitClaim(await requireRouteAccess("/my-shifts"), values(form)); }
  catch (error) { unstable_rethrow(error); return { error: error instanceof ZodError ? "Укажите дату, филиал и подтвердите полную смену." : error instanceof Error ? error.message : "Не удалось отправить отметку." }; }
  revalidatePath("/my-shifts"); revalidatePath("/payroll"); redirect("/my-shifts?saved=1");
}
