"use server";

import { getCurrentSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { searchRentalCustomers, searchRentalVariants, quoteRentalVariant } from "@/lib/orders/mobile";
import { requireBranchAccess } from "@/lib/staff/branch-access";
import { createTenantContext } from "@/lib/tenant/context";
import { parseRentalPeriodForBranch } from "@/lib/orders/rental-datetime";

type ContextInput = { branchId: string; rentalStart: string; rentalEnd: string; quantity?: number };

async function context(input: ContextInput) {
  const session = await getCurrentSession();
  if (!session) throw new Error("UNAUTHORIZED");
  await requirePermission(session, "ORDER_CREATE");
  const tenant = createTenantContext(session.organizationId);
  await requireBranchAccess(tenant, session.membershipId, input.branchId);
  const { rentalStart: requestedFrom, rentalEnd: requestedUntil } = await parseRentalPeriodForBranch(tenant, input), quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("INVALID_CONTEXT");
  return { session, tenant, rental: { branchId: input.branchId, requestedFrom, requestedUntil, quantity } };
}

export async function searchRentalCustomersAction(rawQuery: string) {
  try {
    const session = await getCurrentSession();
    if (!session) return { ok: false as const, message: "Войдите в CRM и повторите поиск." };
    await requirePermission(session, "ORDER_CREATE");
    return { ok: true as const, results: await searchRentalCustomers(createTenantContext(session.organizationId), rawQuery) };
  } catch {
    return { ok: false as const, message: "Не удалось найти клиента." };
  }
}

export async function searchRentalItemsAction(rawQuery: string, input: ContextInput) {
  try {
    const { tenant, rental } = await context(input);
    return { ok: true as const, results: await searchRentalVariants(tenant, rawQuery, rental) };
  } catch {
    return { ok: false as const, message: "Сначала выберите доступный филиал и корректный период аренды." };
  }
}

export async function quoteRentalVariantAction(variantId: string, input: ContextInput) {
  try {
    const { tenant, rental } = await context(input);
    const result = await quoteRentalVariant(tenant, variantId, rental);
    return result ? { ok: true as const, result } : { ok: false as const, message: "Вариант недоступен для заказа." };
  } catch {
    return { ok: false as const, message: "Не удалось проверить товар для выбранного периода." };
  }
}
