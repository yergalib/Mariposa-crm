import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type OrderChannel } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import type { AuthContext } from "@/lib/auth/session";
import { requireUserBranchAccess } from "@/lib/staff/branch-access";
import { defaultHasPermission, type PermissionKey } from "@/lib/permissions/registry";
import { lockOrderFinance } from "@/lib/finance/order-lock";
import { lockCapacityResources, lockInstanceResources } from "@/lib/inventory/capacity-lock";
import { getPermanentFleetReductionAvailabilityWithClient } from "@/lib/availability/capacity";
import { synchronizeOrderChargeWithClient } from "@/lib/finance/order-payments";
import { getActiveBulkMaintenanceQuantity } from "@/lib/inventory/bulk-maintenance-state";
import { appendAuditLog } from "@/lib/audit/log";
import { OrderError } from "@/lib/orders/errors";
import { catalogVariantLabel } from "@/lib/catalog/labels";

type Actor = Pick<AuthContext, "userId" | "membershipId" | "role">;
type DraftItem = { productVariantId: string; quantity: number; discountMinor?: bigint; adjustmentReason?: string | null };
type DraftInput = { branchId: string; customerId: string; channel: OrderChannel; currency?: string; discountMinor?: bigint; internalComment?: string | null; idempotencyKey: string; items: DraftItem[] };
type Selection = { orderItemId: string; productInstanceIds?: string[] };

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const commandKey = (input: string) => {
  const key = input.trim();
  if (!key || key.length > 150) throw new OrderError("VALIDATION", "Некорректный ключ операции.");
  return key;
};
const stable = (value: unknown): string => JSON.stringify(value, (_key, entry) => typeof entry === "bigint" ? entry.toString() : entry, 0);
const eventPayload = (idempotencyKey: string, payloadHash: string): Prisma.InputJsonObject => ({ idempotencyKey, payloadHash });
const eventMatches = (payload: Prisma.JsonValue | null, idempotencyKey: string, payloadHash: string) => Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && payload.idempotencyKey === idempotencyKey && payload.payloadHash === payloadHash);

async function orderNumber(tx: Prisma.TransactionClient, organizationId: string) {
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>(Prisma.sql`INSERT INTO "order_counters"("organization_id","next_value","updated_at") VALUES(${organizationId}::uuid,2,CURRENT_TIMESTAMP) ON CONFLICT("organization_id") DO UPDATE SET "next_value"="order_counters"."next_value"+1,"updated_at"=CURRENT_TIMESTAMP RETURNING "next_value"-1 AS value`);
  if (!rows[0]) throw new OrderError("VALIDATION", "Не удалось создать номер продажи.");
  return `S-${rows[0].value.toString().padStart(6, "0")}`;
}

async function addEvent(tx: Prisma.TransactionClient, input: { organizationId: string; orderId: string; eventType: string; userId: string; fromStatus?: "DRAFT" | "CONFIRMED"; toStatus: "DRAFT" | "CONFIRMED" | "COMPLETED" | "CANCELLED"; payload?: Prisma.InputJsonObject }) {
  return tx.orderEvent.create({ data: { organizationId: input.organizationId, orderId: input.orderId, eventType: input.eventType, createdByUserId: input.userId, fromStatus: input.fromStatus, toStatus: input.toStatus, payload: input.payload } });
}

async function requirePermissionWithClient(tx: Prisma.TransactionClient, tenant: TenantContext, actor: Actor, permission: PermissionKey) {
  const membership = await tx.organizationMembership.findFirst({ where: { id: actor.membershipId, organizationId: tenant.organizationId, userId: actor.userId, status: "ACTIVE" }, select: { role: true, permissionOverrides: { where: { permissionKey: permission }, select: { effect: true }, take: 1 } } });
  if (!membership) throw new OrderError("FORBIDDEN", "Недостаточно прав для выполнения операции.");
  const override = membership.permissionOverrides[0];
  if (!(override ? override.effect === "ALLOW" : defaultHasPermission(membership.role, permission))) throw new OrderError("FORBIDDEN", "Недостаточно прав для выполнения операции.");
}

export async function createSaleDraft(tenant: TenantContext, input: DraftInput, actor: Actor, client?: Prisma.TransactionClient) {
  const key = commandKey(input.idempotencyKey);
  if (!input.items.length) throw new OrderError("VALIDATION", "Добавьте хотя бы одну позицию.");
  const normalized = {
    branchId: input.branchId, customerId: input.customerId, channel: input.channel,
    currency: (input.currency ?? "KZT").trim().toUpperCase(), discountMinor: input.discountMinor ?? BigInt(0),
    internalComment: input.internalComment?.trim() || null,
    items: input.items.map((item) => ({ ...item, discountMinor: item.discountMinor ?? BigInt(0), adjustmentReason: item.adjustmentReason?.trim() || null }))
  };
  if (!/^[A-Z]{3}$/.test(normalized.currency) || normalized.discountMinor < BigInt(0)) throw new OrderError("VALIDATION", "Некорректные коммерческие данные продажи.");
  const payloadHash = hash(stable(normalized));
  const operation = async (tx: Prisma.TransactionClient) => {
    await requirePermissionWithClient(tx, tenant, actor, "ORDER_CREATE");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenant.organizationId + ":sale-create:" + key},0))`;
    await requireUserBranchAccess(tx, tenant, actor.userId, normalized.branchId);
    const replay = await tx.order.findFirst({ where: { organizationId: tenant.organizationId, creationIdempotencyKey: key } });
    if (replay) {
      if (replay.creationPayloadHash !== payloadHash) throw new OrderError("VALIDATION", "Ключ операции уже использован с другими данными.");
      return replay;
    }
    const customer = await tx.customer.findFirst({ where: { id: normalized.customerId, organizationId: tenant.organizationId, status: { not: "ARCHIVED" } }, select: { id: true } });
    if (!customer) throw new OrderError("NOT_FOUND", "Клиент не найден.");
    const now = new Date();
    const snapshots = [];
    for (const item of normalized.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 1000 || item.discountMinor < BigInt(0)) throw new OrderError("VALIDATION", "Некорректное количество или скидка.");
      const variant = await tx.productVariant.findFirst({
        where: { id: item.productVariantId, organizationId: tenant.organizationId, isActive: true, product: { archivedAt: null, isSellable: true } },
        select: { id: true, sku: true, product: { select: { name: true } }, execution: { select: { name: true } }, size: { select: { name: true, code: true, sizeSystem: true } }, prices: { where: { organizationId: tenant.organizationId, type: "SALE", validFrom: { lte: now }, AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, { OR: [{ branchId: normalized.branchId }, { branchId: null }] }] }, orderBy: [{ branchId: "desc" }, { validFrom: "desc" }], take: 1 } }
      });
      const price = variant?.prices[0];
      if (!variant || !price) throw new OrderError("PRICE_NOT_FOUND", "Для товара не задана актуальная цена продажи.");
      if (price.currency !== normalized.currency) throw new OrderError("VALIDATION", "Валюта цены не совпадает с валютой продажи.");
      const gross = price.amountMinor * BigInt(item.quantity);
      if (item.discountMinor > gross) throw new OrderError("VALIDATION", "Скидка позиции превышает стоимость.");
      snapshots.push({ organizationId: tenant.organizationId, productVariantId: variant.id, quantity: item.quantity, status: "DRAFT" as const, unitPriceMinor: price.amountMinor, discountTotalMinor: item.discountMinor, lineTotalMinor: gross - item.discountMinor, currency: price.currency, productNameSnapshot: variant.product.name, variantNameSnapshot: catalogVariantLabel(variant), skuSnapshot: variant.sku, adjustmentReason: item.adjustmentReason });
    }
    const subtotal = snapshots.reduce((sum, item) => sum + item.unitPriceMinor * BigInt(item.quantity), BigInt(0));
    const lineDiscount = snapshots.reduce((sum, item) => sum + item.discountTotalMinor, BigInt(0));
    if (normalized.discountMinor > subtotal - lineDiscount) throw new OrderError("VALIDATION", "Скидка заказа превышает стоимость.");
    const total = subtotal - lineDiscount - normalized.discountMinor;
    const order = await tx.order.create({ data: { organizationId: tenant.organizationId, orderNumber: await orderNumber(tx, tenant.organizationId), branchId: normalized.branchId, customerId: normalized.customerId, type: "SALE", channel: normalized.channel, status: "DRAFT", currency: normalized.currency, subtotalMinor: subtotal, discountTotalMinor: normalized.discountMinor, totalMinor: total, balanceDueMinor: total, internalComment: normalized.internalComment, createdByUserId: actor.userId, creationIdempotencyKey: key, creationPayloadHash: payloadHash, items: { create: snapshots } } });
    await addEvent(tx, { organizationId: tenant.organizationId, orderId: order.id, eventType: "SALE_DRAFT_CREATED", userId: actor.userId, toStatus: "DRAFT", payload: eventPayload(key, payloadHash) });
    await appendAuditLog(tx, { organizationId: tenant.organizationId, branchId: order.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "SALE_DRAFT_CREATED", entityType: "Order", entityId: order.id, correlationId: key, metadata: { itemCount: snapshots.length, totalMinor: total.toString(), status: "DRAFT" } });
    return order;
  };
  return client ? operation(client) : db.$transaction(operation, { maxWait: 10_000, timeout: 30_000 });
}

function normalizeSelections(selections: Selection[]) {
  return selections.map((selection) => ({ orderItemId: selection.orderItemId, productInstanceIds: [...new Set(selection.productInstanceIds ?? [])].sort() })).sort((a, b) => a.orderItemId.localeCompare(b.orderItemId));
}

export async function confirmSale(tenant: TenantContext, orderId: string, selections: Selection[], idempotencyKeyRaw: string, actor: Actor, client?: Prisma.TransactionClient) {
  const idempotencyKey = commandKey(idempotencyKeyRaw), normalizedSelections = normalizeSelections(selections), payloadHash = hash(stable(normalizedSelections));
  const operation = async (tx: Prisma.TransactionClient) => {
    await requirePermissionWithClient(tx, tenant, actor, "SALE_CONFIRM");
    await lockOrderFinance(tx, tenant.organizationId, orderId);
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "orders" WHERE "id"=${orderId}::uuid AND "organization_id"=${tenant.organizationId}::uuid FOR UPDATE`);
    const order = await tx.order.findFirst({ where: { id: orderId, organizationId: tenant.organizationId }, include: { items: { where: { removedAt: null }, include: { productVariant: { include: { product: { select: { trackingMode: true, isSellable: true, archivedAt: true } } } } } } } });
    if (!locked[0] || !order) throw new OrderError("NOT_FOUND", "Продажа не найдена.");
    await requireUserBranchAccess(tx, tenant, actor.userId, order.branchId);
    const prior = await tx.orderEvent.findFirst({ where: { organizationId: tenant.organizationId, orderId, eventType: "SALE_CONFIRMED" }, orderBy: { createdAt: "desc" } });
    if (["CONFIRMED", "COMPLETED"].includes(order.status) && prior) {
      if (!eventMatches(prior.payload, idempotencyKey, payloadHash)) throw new OrderError("INVALID_STATE", "Продажа уже подтверждена другой операцией.");
      return order;
    }
    if (order.type !== "SALE" || order.status !== "DRAFT" || !order.items.length) throw new OrderError("INVALID_STATE", "Подтвердить можно только заполненный черновик продажи.");
    const selectionByItem = new Map(normalizedSelections.map((selection) => [selection.orderItemId, selection.productInstanceIds]));
    if (normalizedSelections.some((selection) => !order.items.some((item) => item.id === selection.orderItemId))) throw new OrderError("VALIDATION", "Выбран неизвестный экземпляр позиции.");
    const instanceIds = order.items.flatMap((item) => selectionByItem.get(item.id) ?? []);
    await lockCapacityResources(tx, order.items.map((item) => ({ organizationId: tenant.organizationId, branchId: order.branchId, productVariantId: item.productVariantId })));
    await lockInstanceResources(tx, tenant.organizationId, instanceIds);
    const now = new Date();
    await tx.order.update({ where: { id: order.id }, data: { status: "CONFIRMED", confirmedAt: now, version: { increment: 1 } } });
    for (const item of order.items) {
      if (!item.productVariant.isActive || !item.productVariant.product.isSellable || item.productVariant.product.archivedAt) throw new OrderError("INVALID_STATE", "Один из товаров больше нельзя продавать.");
      const mode = item.productVariant.product.trackingMode, selected = selectionByItem.get(item.id) ?? [];
      if (mode === "BULK" && selected.length) throw new OrderError("VALIDATION", "Для количественного товара экземпляры не выбираются.");
      if (mode === "SERIALIZED" && selected.length !== item.quantity) throw new OrderError("VALIDATION", "Выберите все экземпляры поэкземплярного товара.");
      const capacity = await getPermanentFleetReductionAvailabilityWithClient(tx, { tenant, branchId: order.branchId, productVariantId: item.productVariantId, quantity: item.quantity, confirmedAt: now });
      if (!capacity.canFulfill) throw new OrderError("CAPACITY", `Недостаточно доступного количества: ${capacity.availableCapacity}.`);
      if (mode === "BULK") {
        await tx.saleInventoryCommitment.create({ data: { organizationId: tenant.organizationId, orderId, orderItemId: item.id, productVariantId: item.productVariantId, branchId: order.branchId, quantity: item.quantity, idempotencyKey: `sc:${hash(idempotencyKey + ":" + item.id)}`, provenance: `SALE_CONFIRM:${hash(idempotencyKey).slice(0, 32)}`, confirmedAt: now, confirmedByUserId: actor.userId } });
      } else {
        const instances = await tx.productInstance.findMany({ where: { id: { in: selected }, organizationId: tenant.organizationId, productVariantId: item.productVariantId, currentBranchId: order.branchId, operationalStatus: "AVAILABLE", retiredAt: null, saleInventoryCommitments: { none: { status: "ACTIVE" } }, capacityAllocations: { none: { status: "ACTIVE", OR: [{ blockedUntil: null }, { blockedUntil: { gt: now } }] } } }, select: { id: true } });
        if (instances.length !== selected.length) throw new OrderError("CAPACITY", "Один из выбранных экземпляров недоступен.");
        for (const instanceId of selected) await tx.saleInventoryCommitment.create({ data: { organizationId: tenant.organizationId, orderId, orderItemId: item.id, productVariantId: item.productVariantId, productInstanceId: instanceId, branchId: order.branchId, quantity: 1, idempotencyKey: `sc:${hash(idempotencyKey + ":" + item.id + ":" + instanceId)}`, provenance: `SALE_CONFIRM:${hash(idempotencyKey).slice(0, 32)}`, confirmedAt: now, confirmedByUserId: actor.userId } });
      }
    }
    await tx.orderItem.updateMany({ where: { organizationId: tenant.organizationId, orderId, removedAt: null }, data: { status: "RESERVED" } });
    await synchronizeOrderChargeWithClient(tx, tenant, orderId, actor);
    await addEvent(tx, { organizationId: tenant.organizationId, orderId, eventType: "SALE_CONFIRMED", userId: actor.userId, fromStatus: "DRAFT", toStatus: "CONFIRMED", payload: eventPayload(idempotencyKey, payloadHash) });
    await appendAuditLog(tx, { organizationId: tenant.organizationId, branchId: order.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "SALE_CONFIRMED", entityType: "Order", entityId: orderId, correlationId: idempotencyKey, metadata: { itemCount: order.items.length, totalMinor: order.totalMinor.toString(), status: "CONFIRMED" } });
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  };
  return client ? operation(client) : db.$transaction(operation, { maxWait: 10_000, timeout: 60_000 });
}

export async function fulfillSale(tenant: TenantContext, orderId: string, idempotencyKeyRaw: string, actor: Actor, client?: Prisma.TransactionClient) {
  const idempotencyKey = commandKey(idempotencyKeyRaw), payloadHash = hash(orderId);
  const operation = async (tx: Prisma.TransactionClient) => {
    await requirePermissionWithClient(tx, tenant, actor, "SALE_FULFILL");
    await lockOrderFinance(tx, tenant.organizationId, orderId);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "orders" WHERE "id"=${orderId}::uuid AND "organization_id"=${tenant.organizationId}::uuid FOR UPDATE`);
    const order = await tx.order.findFirst({ where: { id: orderId, organizationId: tenant.organizationId }, include: { saleInventoryCommitments: { orderBy: { id: "asc" } } } });
    if (!order) throw new OrderError("NOT_FOUND", "Продажа не найдена.");
    await requireUserBranchAccess(tx, tenant, actor.userId, order.branchId);
    const prior = await tx.orderEvent.findFirst({ where: { organizationId: tenant.organizationId, orderId, eventType: "SALE_FULFILLED" }, orderBy: { createdAt: "desc" } });
    if (order.status === "COMPLETED" && prior) {
      if (!eventMatches(prior.payload, idempotencyKey, payloadHash)) throw new OrderError("INVALID_STATE", "Продажа уже выдана другой операцией.");
      return order;
    }
    if (order.type !== "SALE" || order.status !== "CONFIRMED" || !order.saleInventoryCommitments.length || order.saleInventoryCommitments.some((row) => row.status !== "ACTIVE")) throw new OrderError("INVALID_STATE", "Передать можно только полностью подтверждённую продажу.");
    await lockCapacityResources(tx, order.saleInventoryCommitments.map((row) => ({ organizationId: tenant.organizationId, branchId: row.branchId, productVariantId: row.productVariantId })));
    await lockInstanceResources(tx, tenant.organizationId, order.saleInventoryCommitments.flatMap((row) => row.productInstanceId ? [row.productInstanceId] : []));
    const now = new Date();
    for (const commitment of order.saleInventoryCommitments) {
      if (commitment.productInstanceId) {
        const instance = await tx.productInstance.findFirst({ where: { id: commitment.productInstanceId, organizationId: tenant.organizationId, productVariantId: commitment.productVariantId, currentBranchId: commitment.branchId, operationalStatus: "AVAILABLE", retiredAt: null }, select: { id: true, currentLocationId: true, operationalStatus: true, retiredAt: true } });
        if (!instance) throw new OrderError("INVALID_STATE", "Экземпляр больше недоступен для передачи.");
        await tx.inventoryMovement.create({ data: { organizationId: tenant.organizationId, productVariantId: commitment.productVariantId, productInstanceId: instance.id, type: "SALE_ISSUE", quantity: -1, fromBranchId: commitment.branchId, fromLocationId: instance.currentLocationId, sourceType: "SALE_COMMITMENT", sourceId: commitment.id, idempotencyKey: `sale-issue:${commitment.id}`, createdByUserId: actor.userId, saleInventoryCommitmentId: commitment.id, occurredAt: now } });
        await tx.productInstance.update({ where: { id: instance.id }, data: { operationalStatus: "SOLD", version: { increment: 1 } } });
        await tx.instanceStatusHistory.create({ data: { organizationId: tenant.organizationId, productInstanceId: instance.id, fromStatus: instance.operationalStatus, toStatus: "SOLD", reason: "SALE_FULFILLED", sourceType: "SALE_COMMITMENT", sourceId: commitment.id, changedByUserId: actor.userId, changedAt: now } });
      } else {
        let remaining = commitment.quantity;
        const levels = await tx.stockLevel.findMany({ where: { organizationId: tenant.organizationId, branchId: commitment.branchId, productVariantId: commitment.productVariantId, quantity: { gt: 0 } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
        for (const level of levels) {
          const maintenance = await getActiveBulkMaintenanceQuantity(tx, { organizationId: tenant.organizationId, branchId: commitment.branchId, productVariantId: commitment.productVariantId, locationId: level.locationId });
          const take = Math.min(remaining, Math.max(0, level.quantity - maintenance));
          if (!take) continue;
          await tx.stockLevel.update({ where: { id: level.id }, data: { quantity: { decrement: take } } });
          await tx.inventoryMovement.create({ data: { organizationId: tenant.organizationId, productVariantId: commitment.productVariantId, type: "SALE_ISSUE", quantity: -take, fromBranchId: commitment.branchId, fromLocationId: level.locationId, sourceType: "SALE_COMMITMENT", sourceId: commitment.id, idempotencyKey: `sale-issue:${commitment.id}:${level.id}`, createdByUserId: actor.userId, saleInventoryCommitmentId: commitment.id, occurredAt: now } });
          remaining -= take;
          if (!remaining) break;
        }
        if (remaining) throw new OrderError("CAPACITY", "Недостаточно фактически доступного остатка для передачи.");
      }
      await tx.saleInventoryCommitment.update({ where: { id: commitment.id }, data: { status: "FULFILLED", terminalAt: now, terminalByUserId: actor.userId, terminalReason: "SALE_HANDOVER_COMPLETED" } });
    }
    await tx.orderItem.updateMany({ where: { organizationId: tenant.organizationId, orderId, removedAt: null }, data: { status: "COMPLETED" } });
    const completed = await tx.order.update({ where: { id: orderId }, data: { status: "COMPLETED", completedAt: now, version: { increment: 1 } } });
    await addEvent(tx, { organizationId: tenant.organizationId, orderId, eventType: "SALE_FULFILLED", userId: actor.userId, fromStatus: "CONFIRMED", toStatus: "COMPLETED", payload: eventPayload(idempotencyKey, payloadHash) });
    await appendAuditLog(tx, { organizationId: tenant.organizationId, branchId: order.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "SALE_FULFILLED", entityType: "Order", entityId: orderId, correlationId: idempotencyKey, metadata: { quantity: order.saleInventoryCommitments.reduce((sum, row) => sum + row.quantity, 0), status: "COMPLETED" } });
    return completed;
  };
  return client ? operation(client) : db.$transaction(operation, { maxWait: 10_000, timeout: 60_000 });
}

export async function cancelSale(tenant: TenantContext, orderId: string, reasonRaw: string, idempotencyKeyRaw: string, actor: Actor, client?: Prisma.TransactionClient) {
  const reason = reasonRaw.trim(), idempotencyKey = commandKey(idempotencyKeyRaw), payloadHash = hash(reason);
  if (reason.length < 3 || reason.length > 500) throw new OrderError("VALIDATION", "Укажите причину отмены.");
  const operation = async (tx: Prisma.TransactionClient) => {
    await requirePermissionWithClient(tx, tenant, actor, "ORDER_CANCEL");
    await lockOrderFinance(tx, tenant.organizationId, orderId);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "orders" WHERE "id"=${orderId}::uuid AND "organization_id"=${tenant.organizationId}::uuid FOR UPDATE`);
    const order = await tx.order.findFirst({ where: { id: orderId, organizationId: tenant.organizationId }, include: { saleInventoryCommitments: true } });
    if (!order) throw new OrderError("NOT_FOUND", "Продажа не найдена.");
    await requireUserBranchAccess(tx, tenant, actor.userId, order.branchId);
    const prior = await tx.orderEvent.findFirst({ where: { organizationId: tenant.organizationId, orderId, eventType: "SALE_CANCELLED" }, orderBy: { createdAt: "desc" } });
    if (order.status === "CANCELLED" && prior) {
      if (!eventMatches(prior.payload, idempotencyKey, payloadHash)) throw new OrderError("INVALID_STATE", "Продажа уже отменена другой операцией.");
      return order;
    }
    if (order.type !== "SALE" || !["DRAFT", "CONFIRMED"].includes(order.status)) throw new OrderError("INVALID_STATE", "Эту продажу нельзя отменить.");
    if (await tx.inventoryMovement.count({ where: { organizationId: tenant.organizationId, type: "SALE_ISSUE", saleInventoryCommitment: { orderId } } })) throw new OrderError("INVALID_STATE", "Переданную продажу нельзя отменить без процедуры возврата товара.");
    const netCash = (await tx.financialTransaction.aggregate({ where: { organizationId: tenant.organizationId, orderId, OR: [{ kind: { in: ["PAYMENT_RECEIVED", "CUSTOMER_REFUND"] } }, { kind: "REVERSAL", reversalOf: { kind: { in: ["PAYMENT_RECEIVED", "CUSTOMER_REFUND"] } } }] }, _sum: { cashEffectMinor: true } }))._sum.cashEffectMinor ?? BigInt(0);
    if (netCash !== BigInt(0)) throw new OrderError("INVALID_STATE", "Сначала полностью верните клиенту полученную оплату.");
    const fromStatus = order.status as "DRAFT" | "CONFIRMED", now = new Date();
    if (order.status === "CONFIRMED") {
      await synchronizeOrderChargeWithClient(tx, tenant, orderId, actor, BigInt(0));
      await tx.saleInventoryCommitment.updateMany({ where: { organizationId: tenant.organizationId, orderId, status: "ACTIVE" }, data: { status: "CANCELLED", terminalAt: now, terminalByUserId: actor.userId, terminalReason: reason } });
    }
    await tx.orderItem.updateMany({ where: { organizationId: tenant.organizationId, orderId }, data: { status: "CANCELLED" } });
    const cancelled = await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: now, cancellationReason: reason, version: { increment: 1 } } });
    await addEvent(tx, { organizationId: tenant.organizationId, orderId, eventType: "SALE_CANCELLED", userId: actor.userId, fromStatus, toStatus: "CANCELLED", payload: eventPayload(idempotencyKey, payloadHash) });
    await appendAuditLog(tx, { organizationId: tenant.organizationId, branchId: order.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "SALE_CANCELLED", entityType: "Order", entityId: orderId, correlationId: idempotencyKey, metadata: { status: "CANCELLED", reason } });
    return cancelled;
  };
  return client ? operation(client) : db.$transaction(operation, { maxWait: 10_000, timeout: 60_000 });
}
