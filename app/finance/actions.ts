"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRouteAccess } from "@/lib/auth/session";
import { reverseVisibleFinancialTransaction } from "@/lib/finance/reversal-workflow";
import { FinanceError } from "@/lib/finance/errors";
import { PermissionError } from "@/lib/permissions/effective";

export async function reverseFinancialTransactionAction(form: FormData) {
  const session = await requireRouteAccess("/finance");
  const transactionId = String(form.get("transactionId") ?? "");
  let result;
  try {
    result = await reverseVisibleFinancialTransaction(session, {
      transactionId, idempotencyKey: form.get("idempotencyKey"),
      reason: form.get("reason"), confirmed: form.get("confirmed"),
    });
  } catch (error) {
    const message = error instanceof FinanceError || error instanceof PermissionError
      ? error.message : "Не удалось исправить операцию. Повторите попытку с тем же запросом.";
    const safeId = /^[a-f0-9-]{36}$/i.test(transactionId) ? transactionId : "invalid";
    redirect(`/finance/${safeId}/reverse?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/"); revalidatePath("/finance"); revalidatePath("/customers");
  if (result.customerId) revalidatePath(`/customers/${result.customerId}`);
  if (result.orderId) revalidatePath(`/orders/${result.orderId}`);
  redirect("/finance?ok=reversed");
}
