"use server";
import {redirectWithOrderContext} from "@/lib/orders/action-navigation";

import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { OrderChannel, type Prisma } from "@/generated/prisma/client";
import { withFittingSale } from "@/lib/workspace/fitting-sale";
import { getCurrentSession, requireRouteAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { OrderError } from "@/lib/orders/errors";
import { searchRentalCustomers } from "@/lib/orders/mobile";
import { requirePermission } from "@/lib/permissions/effective";
import { createSaleDraft, confirmSale, cancelSale } from "@/lib/sales/lifecycle";
import { fulfillVerifiedSale, type SaleHandoverSelection } from "@/lib/sales/handover";
import { quoteSaleVariant, searchSaleVariants } from "@/lib/sales/mobile";
import { parseTransactionSalePrice } from "@/lib/sales/pricing";
import { requireBranchAccess } from "@/lib/staff/branch-access";
import { createTenantContext } from "@/lib/tenant/context";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const money = (value: unknown) => BigInt(String(value ?? "0").replace(/[\s_]/g, "") || "0");
const channel = (value: string) => {
  if (!Object.values(OrderChannel).includes(value as OrderChannel)) throw new OrderError("VALIDATION", "Некорректный источник продажи.");
  return value as OrderChannel;
};
const message = (error: unknown) => {
  unstable_rethrow(error);
  return error instanceof OrderError ? error.message : "Операция не выполнена. Попробуйте ещё раз.";
};

async function saleCreateContext(branchId: string) {
  const session = await getCurrentSession();
  if (!session) throw new OrderError("FORBIDDEN", "Войдите в CRM.");
  await requirePermission(session, "ORDER_CREATE");
  await requirePermission(session, "SALE_CONFIRM");
  const tenant = createTenantContext(session.organizationId);
  await requireBranchAccess(tenant, session.membershipId, branchId);
  return { session, tenant };
}

export async function searchSaleCustomersAction(rawQuery: string) {
  try {
    const session = await getCurrentSession();
    if (!session) return { ok: false as const, message: "Войдите в CRM и повторите поиск." };
    await requirePermission(session, "ORDER_CREATE");
    return { ok: true as const, results: await searchRentalCustomers(createTenantContext(session.organizationId), rawQuery) };
  } catch {
    return { ok: false as const, message: "Не удалось найти клиента." };
  }
}

export async function searchSaleItemsAction(rawQuery: string, branchId: string) {
  try {
    const { tenant } = await saleCreateContext(branchId);
    return { ok: true as const, results: await searchSaleVariants(tenant, rawQuery, branchId) };
  } catch {
    return { ok: false as const, message: "Выберите доступный филиал и повторите поиск." };
  }
}

export async function quoteSaleVariantAction(variantId: string, branchId: string) {
  try {
    const { tenant } = await saleCreateContext(branchId);
    const result = await quoteSaleVariant(tenant, branchId, variantId);
    return result ? { ok: true as const, result } : { ok: false as const, message: "Товар недоступен для продажи." };
  } catch {
    return { ok: false as const, message: "Не удалось проверить товар." };
  }
}

type SubmittedLine = { productVariantId?: unknown; quantity?: unknown; unitPriceMinor?: unknown; discountMinor?: unknown; adjustmentReason?: unknown; productInstanceIds?: unknown };

export async function createConfirmedSaleAction(form: FormData) {
  const branchId = text(form, "branchId");
  try {
    const { session, tenant } = await saleCreateContext(branchId);
    const parsed = JSON.parse(text(form, "itemsJson")) as SubmittedLine[];
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 100) throw new OrderError("VALIDATION", "Добавьте от 1 до 100 позиций.");
    const seen = new Set<string>();
    const lines = parsed.map((row) => {
      const productVariantId = String(row.productVariantId ?? "");
      if (!productVariantId || seen.has(productVariantId)) throw new OrderError("VALIDATION", "Каждый вариант должен быть добавлен одной строкой.");
      seen.add(productVariantId);
      const productInstanceIds = Array.isArray(row.productInstanceIds) ? row.productInstanceIds.map(String) : [];
      return {
        productVariantId,
        quantity: Number(row.quantity),
        unitPriceMinor: parseTransactionSalePrice(row.unitPriceMinor),
        discountMinor: money(row.discountMinor),
        adjustmentReason: row.adjustmentReason == null ? null : String(row.adjustmentReason),
        productInstanceIds,
      };
    });
    const creationKey = text(form, "idempotencyKey") || `sale-create:${randomUUID()}`;
    const run = async (tx: Prisma.TransactionClient, context = { key: creationKey, source: text(form, "source") || "CRM" }) => {
      const draft = await createSaleDraft(tenant, {
        branchId,
        customerId: text(form, "customerId"),
        channel: channel(context.source),
        discountMinor: money(text(form, "discountMinor")),
        internalComment: text(form, "internalComment") || null,
        idempotencyKey: context.key,
        items: lines.map(({ productInstanceIds: _ignored, ...line }) => line),
      }, session, tx);
      const items = await tx.orderItem.findMany({ where: { organizationId: session.organizationId, orderId: draft.id, removedAt: null }, select: { id: true, productVariantId: true } });
      const selections = items.map((item) => ({ orderItemId: item.id, productInstanceIds: lines.find((line) => line.productVariantId === item.productVariantId)?.productInstanceIds ?? [] }));
      return confirmSale(tenant, draft.id, selections, `sale-confirm:${context.key}`, session, tx);
    };
    const fittingId = text(form, "fittingId");
    const order = fittingId ? await withFittingSale(session, { fittingId, branchId, customerId: text(form, "customerId"), assignedMembershipId: text(form, "assignedMembershipId") }, run)
      : await db.$transaction(tx => run(tx), { maxWait: 10_000, timeout: 60_000 });
    if (fittingId) { revalidatePath(`/fittings/${fittingId}`); revalidatePath("/chats"); }
    revalidatePath("/orders");
    await redirectWithOrderContext(`/orders/${order.id}?ok=${encodeURIComponent("Продажа создана и товар зарезервирован для передачи.")}`);
  } catch (error) {
    unstable_rethrow(error);
    return {error:message(error)};
  }
}

export async function fulfillVerifiedSaleAction(form: FormData) {
  const orderId = text(form, "orderId");
  try {
    const session = await requireRouteAccess("/orders");
    await requirePermission(session, "SALE_FULFILL");
    const order = await db.order.findFirst({ where: { id: orderId, organizationId: session.organizationId, type: "SALE" }, select: { branchId: true } });
    if (!order) throw new OrderError("NOT_FOUND", "Продажа не найдена.");
    const tenant = createTenantContext(session.organizationId);
    await requireBranchAccess(tenant, session.membershipId, order.branchId);
    const selections = JSON.parse(text(form, "selectionsJson")) as SaleHandoverSelection[];
    await fulfillVerifiedSale(tenant, orderId, selections, text(form, "idempotencyKey"), session);
    revalidatePath(`/orders/${orderId}`);
    await redirectWithOrderContext(`/orders/${orderId}?ok=${encodeURIComponent("Товары переданы. Продажа завершена.")}`);
  } catch (error) {
    unstable_rethrow(error);
    await redirectWithOrderContext(`/orders/${orderId}?error=${encodeURIComponent(message(error))}`);
  }
}

export async function cancelSaleAction(form: FormData) {
  const orderId = text(form, "orderId");
  try {
    const session = await requireRouteAccess("/orders");
    await requirePermission(session, "ORDER_CANCEL");
    const tenant = createTenantContext(session.organizationId);
    await cancelSale(tenant, orderId, text(form, "cancellationReason"), text(form, "idempotencyKey"), session);
    revalidatePath(`/orders/${orderId}`);
    await redirectWithOrderContext(`/orders/${orderId}?ok=${encodeURIComponent("Продажа отменена.")}`);
  } catch (error) {
    unstable_rethrow(error);
    await redirectWithOrderContext(`/orders/${orderId}?error=${encodeURIComponent(message(error))}`);
  }
}
