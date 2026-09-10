"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { PurchaseError } from "@/lib/purchases/errors";
import {
  addPurchaseItem,
  archiveSupplier,
  cancelPurchase,
  confirmPurchase,
  createPurchase,
  createSupplier,
  removePurchaseItem,
  updatePurchaseHeader,
  updatePurchaseItem,
  updateSupplier,
} from "@/lib/purchases/management";
import {
  closePartiallyReceivedPurchase,
  receivePurchaseItem,
} from "@/lib/purchases/receipts";
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim(),
  nullable = (f: FormData, k: string) => text(f, k) || null,
  big = (f: FormData, k: string) =>
    BigInt(text(f, k).replace(/[\s_]/g, "") || "0"),
  integer = (f: FormData, k: string) => Number(text(f, k));
const actor = (s: Awaited<ReturnType<typeof requireRouteAccess>>) => ({
  userId: s.userId,
  membershipId: s.membershipId,
  role: s.role,
});
const msg = (e: unknown) => {
  unstable_rethrow(e);
  return e instanceof PurchaseError
    ? e.message
    : e instanceof ZodError
      ? (e.issues[0]?.message ?? "Проверьте форму.")
      : "Операция не выполнена.";
};
const go = (path: string, key: "ok" | "error", message: string): never =>
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
async function context() {
  const s = await requireRouteAccess("/purchases");
  return { s, t: createTenantContext(s.organizationId) };
}
const supplier = (f: FormData) => ({
  name: text(f, "name"),
  contactName: nullable(f, "contactName"),
  phone: nullable(f, "phone"),
  email: nullable(f, "email"),
  address: nullable(f, "address"),
  notes: nullable(f, "notes"),
});
const item = (f: FormData) => ({
  productVariantId: text(f, "productVariantId"),
  orderedQuantity: integer(f, "orderedQuantity"),
  unitCostMinor: big(f, "unitCostMinor"),
  lineDiscountMinor: big(f, "lineDiscountMinor"),
  note: nullable(f, "itemNote"),
});
const header = (f: FormData) => ({
  supplierId: text(f, "supplierId"),
  destinationBranchId: text(f, "destinationBranchId"),
  currency: text(f, "currency"),
  additionalCostMinor: big(f, "additionalCostMinor"),
  externalReference: nullable(f, "externalReference"),
  note: nullable(f, "note"),
});
export async function createSupplierAction(f: FormData) {
  try {
    const { s, t } = await context();
    await createSupplier(t, supplier(f), actor(s));
    revalidatePath("/purchases/suppliers");
    go("/purchases/suppliers", "ok", "Поставщик создан.");
  } catch (e) {
    go("/purchases/suppliers", "error", msg(e));
  }
}
export async function updateSupplierAction(f: FormData) {
  try {
    const { s, t } = await context();
    await updateSupplier(t, text(f, "supplierId"), supplier(f), actor(s));
    revalidatePath("/purchases/suppliers");
    go("/purchases/suppliers", "ok", "Поставщик обновлён.");
  } catch (e) {
    go("/purchases/suppliers", "error", msg(e));
  }
}
export async function archiveSupplierAction(f: FormData) {
  try {
    const { s, t } = await context();
    await archiveSupplier(t, text(f, "supplierId"), actor(s));
    revalidatePath("/purchases/suppliers");
    go(
      "/purchases/suppliers",
      "ok",
      "Поставщик архивирован. История закупок сохранена.",
    );
  } catch (e) {
    go("/purchases/suppliers", "error", msg(e));
  }
}
export async function createPurchaseAction(f: FormData) {
  try {
    const { s, t } = await context(),
      row = await createPurchase(
        t,
        {
          ...header(f),
          idempotencyKey: text(f, "idempotencyKey") || randomUUID(),
        },
        [item(f)],
        actor(s),
      );
    revalidatePath("/purchases");
    redirect(
      `/purchases/${row.id}?ok=${encodeURIComponent("Черновик закупки создан.")}`,
    );
  } catch (e) {
    go("/purchases/new", "error", msg(e));
  }
}
export async function updatePurchaseAction(f: FormData) {
  const id = text(f, "purchaseId");
  try {
    const { s, t } = await context();
    await updatePurchaseHeader(
      t,
      id,
      { ...header(f), expectedVersion: integer(f, "version") },
      actor(s),
    );
    revalidatePath(`/purchases/${id}`);
    go(`/purchases/${id}`, "ok", "Закупка обновлена.");
  } catch (e) {
    go(`/purchases/${id}`, "error", msg(e));
  }
}
export async function addPurchaseItemAction(f: FormData) {
  const id = text(f, "purchaseId");
  try {
    const { s, t } = await context();
    await addPurchaseItem(t, id, item(f), actor(s));
    revalidatePath(`/purchases/${id}`);
    go(`/purchases/${id}`, "ok", "Позиция добавлена.");
  } catch (e) {
    go(`/purchases/${id}`, "error", msg(e));
  }
}
export async function updatePurchaseItemAction(f: FormData) {
  const id = text(f, "purchaseId");
  try {
    const { s, t } = await context();
    await updatePurchaseItem(
      t,
      id,
      text(f, "purchaseItemId"),
      item(f),
      actor(s),
    );
    revalidatePath(`/purchases/${id}`);
    go(`/purchases/${id}`, "ok", "Позиция обновлена.");
  } catch (e) {
    go(`/purchases/${id}`, "error", msg(e));
  }
}
export async function removePurchaseItemAction(f: FormData) {
  const id = text(f, "purchaseId");
  try {
    const { s, t } = await context();
    await removePurchaseItem(t, id, text(f, "purchaseItemId"), actor(s));
    revalidatePath(`/purchases/${id}`);
    go(`/purchases/${id}`, "ok", "Позиция удалена.");
  } catch (e) {
    go(`/purchases/${id}`, "error", msg(e));
  }
}
export async function confirmPurchaseAction(f: FormData) {
  const id = text(f, "purchaseId");
  try {
    const { s, t } = await context();
    await confirmPurchase(t, id, text(f, "idempotencyKey"), actor(s));
    revalidatePath(`/purchases/${id}`);
    go(
      `/purchases/${id}`,
      "ok",
      "Закупка подтверждена. Склад пока не изменён.",
    );
  } catch (e) {
    go(`/purchases/${id}`, "error", msg(e));
  }
}
export async function cancelPurchaseAction(f: FormData) {
  const id = text(f, "purchaseId");
  try {
    const { s, t } = await context();
    await cancelPurchase(t, id, text(f, "idempotencyKey"), actor(s));
    revalidatePath(`/purchases/${id}`);
    go(`/purchases/${id}`, "ok", "Закупка отменена. История сохранена.");
  } catch (e) {
    go(`/purchases/${id}`, "error", msg(e));
  }
}

export async function receivePurchaseItemAction(f: FormData) {
  const id = text(f, "purchaseId");
  try {
    const { s, t } = await context();
    await receivePurchaseItem(t, {
      purchaseId: id,
      purchaseItemId: text(f, "purchaseItemId"),
      locationId: text(f, "locationId"),
      quantity: integer(f, "quantity"),
      receivedAt: new Date(text(f, "receivedAt")),
      note: nullable(f, "receiptNote"),
      idempotencyKey: text(f, "idempotencyKey") || randomUUID(),
    }, actor(s));
    revalidatePath(`/purchases/${id}`);
    go(`/purchases/${id}`, "ok", "Товар принят на склад.");
  } catch (e) {
    go(`/purchases/${id}`, "error", msg(e));
  }
}

export async function closePurchaseAction(f: FormData) {
  const id = text(f, "purchaseId");
  try {
    const { s, t } = await context();
    await closePartiallyReceivedPurchase(t, id, text(f, "reason"), text(f, "idempotencyKey") || randomUUID(), actor(s));
    revalidatePath(`/purchases/${id}`);
    go(`/purchases/${id}`, "ok", "Частичная поставка завершена.");
  } catch (e) {
    go(`/purchases/${id}`, "error", msg(e));
  }
}
