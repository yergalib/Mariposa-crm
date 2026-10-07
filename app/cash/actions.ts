"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireRouteAccess } from "@/lib/auth/session";
import { acceptCashOrderPayment } from "@/lib/finance/cash";
export async function acceptCashPaymentAction(form: FormData) {
  let orderId: string;
  try {
    const input = Object.fromEntries(["orderId", "amountMinor", "paymentMethodId", "idempotencyKey"].map(key => [key, String(form.get(key) ?? "")]));
    await acceptCashOrderPayment(await requireRouteAccess("/cash"), input);
    orderId = input.orderId;
  } catch (error) { unstable_rethrow(error); return { error: error instanceof ZodError ? error.issues[0]?.message ?? "Проверьте поля оплаты." : error instanceof Error ? error.message : "Не удалось принять оплату." }; }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/cash");
  revalidatePath("/finance");
  redirect("/cash?saved=1");
}
