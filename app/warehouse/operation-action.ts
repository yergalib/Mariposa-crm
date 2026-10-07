"use server";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { createTenantContext } from "@/lib/tenant/context";
import { requireBranchAccess } from "@/lib/staff/branch-access";
import { receiveBulk, receiveSerialized, transferBulk, transferSerialized, changeBulk, changeSerializedStatus } from "@/lib/inventory/management";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
export async function warehouseOperationAction(form: FormData) {
  const operation = text(form, "operation");
  try {
    if (!["receipts", "transfers", "write-offs"].includes(operation)) throw new Error("Неизвестная складская операция.");
    const session = await requireRouteAccess("/warehouse");
    await requirePermission(session, "INVENTORY_VIEW");
    await requirePermission(session, operation === "receipts" ? "INVENTORY_RECEIVE" : operation === "transfers" ? "INVENTORY_TRANSFER" : "INVENTORY_WRITE_OFF");
    // Preserve the existing correction action's two permission checks.
    if (operation === "write-offs") await requirePermission(session, "INVENTORY_ADJUST");
    const tenant = createTenantContext(session.organizationId), actor = { userId: session.userId, membershipId: session.membershipId };
    const mode = text(form, "mode"), quantity = Number(text(form, "quantity"));
    if (mode !== "BULK" && mode !== "SERIALIZED") throw new Error("Выберите тип учёта.");
    if ((mode === "BULK" || operation === "receipts") && (!Number.isSafeInteger(quantity) || quantity < 1)) throw new Error("Количество должно быть целым положительным числом.");
    const idempotencyKey = text(form, "idempotencyKey"), reason = text(form, "reason");
    if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new Error("Обновите страницу перед новой операцией.");
    const variantId = text(form, "variantId"), instanceId = text(form, "instanceId");
    const variant = await db.productVariant.findFirst({ where: { id: variantId, organizationId: session.organizationId, isActive: true, product: { publicationStatus: { not: "ARCHIVED" }, archivedAt: null } }, select: { product: { select: { trackingMode: true } } } });
    if (!variant || variant.product.trackingMode !== mode) throw new Error("Товар недоступен или тип учёта изменился.");
    if (mode === "SERIALIZED" && operation !== "receipts") {
      const instance = await db.productInstance.findFirst({ where: { id: instanceId, organizationId: session.organizationId, productVariantId: variantId }, select: { id: true } });
      if (!instance) throw new Error("Экземпляр не относится к выбранному товару.");
    }
    if (operation === "transfers") {
      const fromBranchId = text(form, "fromBranchId"), toBranchId = text(form, "toBranchId"), fromLocationId = text(form, "fromLocationId"), toLocationId = text(form, "toLocationId");
      await requireBranchAccess(tenant, session.membershipId, fromBranchId);
      await requireBranchAccess(tenant, session.membershipId, toBranchId);
      if (fromBranchId === toBranchId && fromLocationId === toLocationId) throw new Error("Выберите другое место назначения.");
      if (mode === "BULK") await transferBulk(tenant, { variantId, fromBranchId, fromLocationId, toBranchId, toLocationId, quantity, reason, idempotencyKey }, actor);
      else await transferSerialized(tenant, { instanceId, fromBranchId, toBranchId, toLocationId, reason, idempotencyKey }, actor);
    } else if (operation === "receipts") {
      const branchId = text(form, "branchId"), locationId = text(form, "locationId");
      await requireBranchAccess(tenant, session.membershipId, branchId);
      const input = { variantId, branchId, locationId, quantity, comment: reason, idempotencyKey };
      if (mode === "BULK") await receiveBulk(tenant, input, actor);
      else await receiveSerialized(tenant, input, actor);
    } else {
      if (text(form, "confirmed") !== "yes") throw new Error("Подтвердите физическое списание.");
      if (!reason) throw new Error("Укажите причину списания.");
      if (mode === "BULK") {
        const branchId = text(form, "branchId"), locationId = text(form, "locationId");
        await requireBranchAccess(tenant, session.membershipId, branchId);
        await changeBulk(tenant, { variantId, branchId, locationId, delta: -quantity, type: "WRITE_OFF", reason, idempotencyKey }, actor);
      } else await changeSerializedStatus(tenant, { instanceId, type: "WRITE_OFF", reason, idempotencyKey }, actor);
    }
    revalidatePath("/warehouse", "layout");
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Операция не выполнена." };
  }
  redirect(`/warehouse/${operation}?ok=1`);
}
