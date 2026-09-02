import "server-only";

import { Prisma, type ProductInstanceOperationalStatus, type ReturnInspectionResult } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import { normalizeBarcode } from "@/lib/fulfillment/management";
import type { TenantContext } from "@/lib/tenant/context";
import { returnBulkInventory, returnSerializedInventory } from "@/lib/inventory/ledger";

type Actor = { userId: string; branchId?: string };

function requireActorBranch(actor: Actor, branchId: string) {
  if (actor.branchId && actor.branchId !== branchId)
    throw new FulfillmentError("WRONG_BRANCH", "Операция должна выполняться в филиале, где находится экземпляр или заказ.");
}

async function requireMember(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  if (!await tx.organizationMembership.findFirst({ where: { organizationId, userId, status: "ACTIVE" }, select: { id: true } }))
    throw new FulfillmentError("NOT_FOUND", "Аренда не найдена.");
}

async function event(tx: Prisma.TransactionClient, organizationId: string, orderId: string, eventType: string, userId: string, payload: Prisma.InputJsonValue) {
  await tx.orderEvent.create({ data: { organizationId, orderId, eventType, createdByUserId: userId, payload } });
}

async function transition(tx: Prisma.TransactionClient, organizationId: string, instanceId: string, fromStatus: ProductInstanceOperationalStatus, toStatus: ProductInstanceOperationalStatus, userId: string, sourceId: string, reason: string) {
  await tx.productInstance.update({ where: { id: instanceId }, data: { operationalStatus: toStatus, version: { increment: 1 } } });
  await tx.instanceStatusHistory.create({ data: { organizationId, productInstanceId: instanceId, fromStatus, toStatus, reason, sourceType: "ORDER", sourceId, changedByUserId: userId } });
}

export async function lookupCurrentRentalByBarcode(tenant: TenantContext, rawBarcode: string) {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) throw new FulfillmentError("NOT_FOUND", "Штрихкод не найден.");
  const instance = await db.productInstance.findFirst({
    where: { organizationId: tenant.organizationId, barcode },
    include: { productVariant: { include: { product: true, size: true } }, currentBranch: true },
  });
  if (!instance) throw new FulfillmentError("NOT_FOUND", "Штрихкод не найден.");
  if (instance.operationalStatus !== "RENTED") throw new FulfillmentError("INVALID_STATE", "Экземпляр сейчас не находится в аренде.");
  const allocation = await db.capacityAllocation.findFirst({
    where: { organizationId: tenant.organizationId, productInstanceId: instance.id, issuedAt: { not: null }, returnedAt: null },
    include: { order: { include: { customer: true, branch: true } }, orderItem: true }, orderBy: { issuedAt: "desc" },
  });
  if (!allocation?.order || !allocation.orderItem) throw new FulfillmentError("DATA_INTEGRITY", "Для арендованного экземпляра не найдена запись фактической выдачи.");
  return { instance, allocation, order: allocation.order, orderItem: allocation.orderItem, overdue: Boolean(allocation.order.rentalEndAt && new Date() > allocation.order.rentalEndAt) };
}

export async function receiveReturnByBarcode(tenant: TenantContext, rawBarcode: string, result: ReturnInspectionResult, noteRaw: string | null, actor: Actor) {
  if (!["GOOD", "NEEDS_CLEANING", "DAMAGED"].includes(result)) throw new FulfillmentError("INVALID_STATE", "Выберите результат осмотра.");
  const barcode = normalizeBarcode(rawBarcode), note = noteRaw?.trim().slice(0, 1000) || null;
  return db.$transaction(async (tx) => {
    await requireMember(tx, tenant.organizationId, actor.userId);
    const instance = await tx.productInstance.findFirst({ where: { organizationId: tenant.organizationId, barcode } });
    if (!instance) throw new FulfillmentError("NOT_FOUND", "Штрихкод не найден.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenant.organizationId + ":return:" + instance.id}, 0))`;
    const current = await tx.productInstance.findFirst({ where: { id: instance.id, organizationId: tenant.organizationId } });
    if (!current || current.operationalStatus !== "RENTED") throw new FulfillmentError("INVALID_STATE", "Экземпляр уже возвращён или не находится в аренде.");
    const allocation = await tx.capacityAllocation.findFirst({
      where: { organizationId: tenant.organizationId, productInstanceId: current.id, issuedAt: { not: null }, returnedAt: null },
      include: { order: true, orderItem: true }, orderBy: { issuedAt: "desc" },
    });
    if (!allocation?.order || !allocation.orderItem || allocation.issuedQuantity !== 1) throw new FulfillmentError("DATA_INTEGRITY", "Для арендованного экземпляра не найдена корректная запись выдачи.");
    requireActorBranch(actor, allocation.branchId);
    const now = new Date(), destination: ProductInstanceOperationalStatus = result === "GOOD" ? "AVAILABLE" : result === "NEEDS_CLEANING" ? "CLEANING" : "REPAIR";
    await returnSerializedInventory(tx,{organizationId:tenant.organizationId,branchId:allocation.branchId,locationId:current.currentLocationId,variantId:current.productVariantId,instanceId:current.id,allocationId:allocation.id,userId:actor.userId});
    await tx.capacityAllocation.update({ where: { id: allocation.id }, data: { returnedAt: now, returnedByUserId: actor.userId, returnedQuantity: 1, returnInspectionResult: result, returnNote: note } });
    await tx.instanceConditionHistory.create({ data: {
      organizationId: tenant.organizationId, productInstanceId: current.id,
      conditionStatus: result === "DAMAGED" ? "DAMAGED" : result === "NEEDS_CLEANING" ? "WORN" : "GOOD",
      description: note, inspectionType: `RETURN_${result}`, sourceType: "CAPACITY_ALLOCATION", sourceId: allocation.id, inspectedByUserId: actor.userId,
    } });
    await transition(tx, tenant.organizationId, current.id, "RENTED", destination, actor.userId, allocation.order.id, `RETURN_${result}`);
    if (destination === "CLEANING" || destination === "REPAIR") {
      const blockedFrom = allocation.blockedUntil && allocation.blockedUntil > now ? allocation.blockedUntil : now;
      await tx.capacityAllocation.create({ data: {
        organizationId: tenant.organizationId, productVariantId: allocation.productVariantId, productInstanceId: current.id,
        branchId: allocation.branchId, quantity: 1, sourceType: "MAINTENANCE", sourceReferenceId: allocation.id,
        blockedFrom, blockedUntil: null, status: "ACTIVE", assignedByUserId: actor.userId,
      } });
    }
    await event(tx, tenant.organizationId, allocation.order.id, "ITEM_RETURNED", actor.userId, { orderItemId: allocation.orderItem.id, productInstanceId: current.id, inventoryNumber: current.inventoryNumber, returnedAt: now.toISOString(), overdue: Boolean(allocation.order.rentalEndAt && now > allocation.order.rentalEndAt) });
    await event(tx, tenant.organizationId, allocation.order.id, "RETURN_INSPECTED", actor.userId, { orderItemId: allocation.orderItem.id, productInstanceId: current.id, result, note });
    if (destination !== "AVAILABLE") await event(tx, tenant.organizationId, allocation.order.id, destination === "CLEANING" ? "ITEM_SENT_TO_CLEANING" : "ITEM_SENT_TO_REPAIR", actor.userId, { orderItemId: allocation.orderItem.id, productInstanceId: current.id });
    await refreshItemStatus(tx, tenant.organizationId, allocation.orderItem.id);
    return { allocationId: allocation.id, orderId: allocation.order.id, returnedAt: now, destination };
  }, { maxWait: 10_000, timeout: 30_000 });
}

async function refreshItemStatus(tx: Prisma.TransactionClient, organizationId: string, orderItemId: string) {
  const rows = await tx.capacityAllocation.findMany({ where: { organizationId, orderItemId, sourceType: "ORDER" }, select: { issuedQuantity: true, returnedQuantity: true } });
  const issued = rows.reduce((sum, row) => sum + row.issuedQuantity, 0), returned = rows.reduce((sum, row) => sum + row.returnedQuantity, 0);
  await tx.orderItem.update({ where: { id: orderItemId }, data: { status: returned === 0 ? "ISSUED" : returned < issued ? "PARTIALLY_RETURNED" : "RETURNED" } });
}

export async function returnBulkQuantity(tenant: TenantContext, orderId: string, orderItemId: string, quantity: number, actor: Actor) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new FulfillmentError("INVALID_STATE", "Количество возврата должно быть положительным.");
  return db.$transaction(async (tx) => {
    await requireMember(tx, tenant.organizationId, actor.userId);
    const item = await tx.orderItem.findFirst({ where: { id: orderItemId, orderId, organizationId: tenant.organizationId, removedAt: null, productVariant: { product: { trackingMode: "BULK" } } }, include: { order: { select: { branchId: true } }, capacityAllocations: { where: { sourceType: "ORDER", issuedAt: { not: null } }, orderBy: { createdAt: "asc" } } } });
    if (!item) throw new FulfillmentError("NOT_FOUND", "Позиция не найдена.");
    requireActorBranch(actor, item.order.branchId);
    const outstanding = item.capacityAllocations.reduce((sum, row) => sum + row.issuedQuantity - row.returnedQuantity, 0);
    if (quantity > outstanding) throw new FulfillmentError("INVALID_STATE", "Нельзя принять больше единиц, чем было выдано.");
    let remaining = quantity; const now = new Date();
    for (const allocation of item.capacityAllocations) {
      const available = allocation.issuedQuantity - allocation.returnedQuantity, take = Math.min(available, remaining); if (!take) continue;
      await returnBulkInventory(tx,{organizationId:tenant.organizationId,branchId:item.order.branchId,variantId:item.productVariantId,allocationId:allocation.id,fromReturned:allocation.returnedQuantity,quantity:take,userId:actor.userId});
      const returnedQuantity = allocation.returnedQuantity + take;
      await tx.capacityAllocation.update({ where: { id: allocation.id }, data: { returnedQuantity, returnedAt: returnedQuantity === allocation.issuedQuantity ? now : null, returnedByUserId: actor.userId } });
      remaining -= take; if (!remaining) break;
    }
    await refreshItemStatus(tx, tenant.organizationId, item.id);
    await event(tx, tenant.organizationId, orderId, "BULK_ITEMS_RETURNED", actor.userId, { orderItemId, quantity, returnedAt: now.toISOString() });
    return now;
  });
}

export async function completeMaintenanceByBarcode(tenant: TenantContext, rawBarcode: string, expected: "CLEANING" | "REPAIR", actor: Actor) {
  const barcode = normalizeBarcode(rawBarcode);
  return db.$transaction(async (tx) => {
    await requireMember(tx, tenant.organizationId, actor.userId);
    const instance = await tx.productInstance.findFirst({ where: { organizationId: tenant.organizationId, barcode } });
    if (!instance) throw new FulfillmentError("NOT_FOUND", "Штрихкод не найден.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenant.organizationId + ":maintenance:" + instance.id}, 0))`;
    if (instance.operationalStatus !== expected) throw new FulfillmentError("INVALID_STATE", expected === "CLEANING" ? "Экземпляр не находится в чистке." : "Экземпляр не находится в ремонте.");
    const block = await tx.capacityAllocation.findFirst({ where: { organizationId: tenant.organizationId, productInstanceId: instance.id, sourceType: "MAINTENANCE", status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    if (!block?.sourceReferenceId) throw new FulfillmentError("DATA_INTEGRITY", "Не найден operational block обслуживания.");
    requireActorBranch(actor, block.branchId);
    const source = await tx.capacityAllocation.findFirst({ where: { id: block.sourceReferenceId, organizationId: tenant.organizationId }, select: { orderId: true } });
    if (!source?.orderId) throw new FulfillmentError("DATA_INTEGRITY", "Не найден связанный заказ.");
    const now = new Date();
    await tx.capacityAllocation.update({ where: { id: block.id }, data: { status: "RELEASED", releasedAt: now, releaseReason: `${expected}_COMPLETED` } });
    await transition(tx, tenant.organizationId, instance.id, expected, "AVAILABLE", actor.userId, source.orderId, `${expected}_COMPLETED`);
    await event(tx, tenant.organizationId, source.orderId, expected === "CLEANING" ? "CLEANING_COMPLETED" : "REPAIR_COMPLETED", actor.userId, { productInstanceId: instance.id, completedAt: now.toISOString() });
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function completeReturnedOrder(tenant: TenantContext, orderId: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    await requireMember(tx, tenant.organizationId, actor.userId);
    const order = await tx.order.findFirst({ where: { id: orderId, organizationId: tenant.organizationId }, include: { capacityAllocations: { where: { sourceType: "ORDER" } } } });
    if (!order) throw new FulfillmentError("NOT_FOUND", "Заказ не найден.");
    const issued = order.capacityAllocations.reduce((sum, row) => sum + row.issuedQuantity, 0), returned = order.capacityAllocations.reduce((sum, row) => sum + row.returnedQuantity, 0);
    if (!issued || issued !== returned) throw new FulfillmentError("INVALID_STATE", "Заказ можно завершить только после полного возврата всех выданных единиц.");
    const now = new Date(); await tx.orderItem.updateMany({ where: { organizationId: tenant.organizationId, orderId, removedAt: null }, data: { status: "COMPLETED" } });
    await tx.order.update({ where: { id: orderId }, data: { status: "COMPLETED", completedAt: now, version: { increment: 1 } } });
    await tx.orderEvent.create({ data: { organizationId: tenant.organizationId, orderId, eventType: "ORDER_COMPLETED", fromStatus: order.status, toStatus: "COMPLETED", createdByUserId: actor.userId, payload: { completedAt: now.toISOString() } } });
  });
}
