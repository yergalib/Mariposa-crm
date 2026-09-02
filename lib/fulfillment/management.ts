import "server-only";

import { Prisma, type ProductInstanceOperationalStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import type { TenantContext } from "@/lib/tenant/context";

type Actor = { userId: string };
const BLOCKED: ProductInstanceOperationalStatus[] = [
  "PICKING", "READY_FOR_PICKUP", "RENTED", "RETURN_INSPECTION", "CLEANING",
  "REPAIR", "IN_TRANSFER", "SOLD", "WRITTEN_OFF", "LOST",
];

export function normalizeBarcode(value: string) {
  return value.trim().toUpperCase();
}

async function member(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  const found = await tx.organizationMembership.findFirst({
    where: { organizationId, userId, status: "ACTIVE" }, select: { id: true },
  });
  if (!found) throw new FulfillmentError("NOT_FOUND", "Заказ не найден.");
}

async function orderEvent(tx: Prisma.TransactionClient, organizationId: string, orderId: string, eventType: string, userId: string, payload: Prisma.InputJsonValue) {
  await tx.orderEvent.create({ data: { organizationId, orderId, eventType, createdByUserId: userId, payload } });
}

async function status(tx: Prisma.TransactionClient, organizationId: string, instanceId: string, fromStatus: ProductInstanceOperationalStatus, toStatus: ProductInstanceOperationalStatus, actor: Actor, orderId: string) {
  if (fromStatus === toStatus) return;
  await tx.productInstance.update({ where: { id: instanceId }, data: { operationalStatus: toStatus, version: { increment: 1 } } });
  await tx.instanceStatusHistory.create({ data: {
    organizationId, productInstanceId: instanceId, fromStatus, toStatus,
    reason: "ORDER_FULFILLMENT", sourceType: "ORDER", sourceId: orderId, changedByUserId: actor.userId,
  } });
}

export async function lookupInstanceByBarcode(tenant: TenantContext, rawBarcode: string) {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) throw new FulfillmentError("NOT_FOUND", "Штрихкод не найден.");
  const instance = await db.productInstance.findFirst({
    where: { organizationId: tenant.organizationId, barcode },
    include: { productVariant: { include: { product: true, size: true } }, currentBranch: true },
  });
  if (!instance) throw new FulfillmentError("NOT_FOUND", "Штрихкод не найден.");
  return instance;
}

export async function assignInstanceByBarcode(tenant: TenantContext, orderId: string, orderItemId: string, rawBarcode: string, actor: Actor) {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) throw new FulfillmentError("NOT_FOUND", "Штрихкод не найден.");
  try {
    return await db.$transaction(async (tx) => {
      await member(tx, tenant.organizationId, actor.userId);
      const item = await tx.orderItem.findFirst({
        where: { id: orderItemId, orderId, organizationId: tenant.organizationId, removedAt: null },
        include: { order: true, productVariant: { include: { product: true, size: true } }, capacityAllocations: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } } },
      });
      if (!item || !["RESERVED", "CONFIRMED"].includes(item.order.status)) throw new FulfillmentError("INVALID_STATE", "Назначение доступно только для забронированного или подтверждённого заказа.");
      if (item.productVariant.product.trackingMode !== "SERIALIZED") throw new FulfillmentError("INVALID_STATE", "Для количественного товара экземпляры не назначаются.");
      const instance = await tx.productInstance.findFirst({
        where: { organizationId: tenant.organizationId, barcode },
        include: { productVariant: { select: { productId: true, sizeId: true } } },
      });
      if (!instance) throw new FulfillmentError("NOT_FOUND", "Штрихкод не найден.");
      if (instance.productVariant.productId !== item.productVariant.productId) throw new FulfillmentError("WRONG_PRODUCT", "Отсканирован другой товар.");
      if (instance.productVariantId !== item.productVariantId) throw new FulfillmentError("WRONG_SIZE", "Отсканирован экземпляр другого размера.");
      if (instance.currentBranchId !== item.order.branchId) throw new FulfillmentError("WRONG_BRANCH", "Экземпляр находится в другом филиале.");
      if (instance.retiredAt || BLOCKED.includes(instance.operationalStatus)) throw new FulfillmentError("INSTANCE_UNAVAILABLE", "Экземпляр недоступен для назначения.");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenant.organizationId + ":instance:" + instance.id}, 0))`;
      const duplicate = await tx.capacityAllocation.findFirst({ where: { organizationId: tenant.organizationId, orderItemId, productInstanceId: instance.id, status: "ACTIVE" }, select: { id: true } });
      if (duplicate) throw new FulfillmentError("INSTANCE_UNAVAILABLE", "Экземпляр уже назначен этой позиции.");
      const aggregate = await tx.capacityAllocation.findFirst({
        where: { organizationId: tenant.organizationId, orderId, orderItemId, status: "ACTIVE", productInstanceId: null }, orderBy: { createdAt: "asc" },
      });
      if (!aggregate) throw new FulfillmentError("ASSIGNMENT_LIMIT", "Все требуемые экземпляры уже назначены.");
      const conflict = await tx.capacityAllocation.findFirst({
        where: { organizationId: tenant.organizationId, productInstanceId: instance.id, status: "ACTIVE", blockedFrom: { lt: aggregate.blockedUntil! }, OR: [{ blockedUntil: null }, { blockedUntil: { gt: aggregate.blockedFrom } }] }, select: { id: true },
      });
      if (conflict) throw new FulfillmentError("INSTANCE_UNAVAILABLE", "Экземпляр уже назначен на пересекающийся период.");
      const assignedAt = new Date();
      const allocation = aggregate.quantity === 1
        ? await tx.capacityAllocation.update({ where: { id: aggregate.id }, data: { productInstanceId: instance.id, assignedAt, assignedByUserId: actor.userId } })
        : await (async () => {
            await tx.capacityAllocation.update({ where: { id: aggregate.id }, data: { quantity: { decrement: 1 } } });
            return tx.capacityAllocation.create({ data: {
              organizationId: aggregate.organizationId, orderId: aggregate.orderId, orderItemId: aggregate.orderItemId,
              productVariantId: aggregate.productVariantId, productInstanceId: instance.id, branchId: aggregate.branchId,
              quantity: 1, sourceType: aggregate.sourceType, sourceReferenceId: aggregate.sourceReferenceId,
              blockedFrom: aggregate.blockedFrom, blockedUntil: aggregate.blockedUntil, status: "ACTIVE", assignedAt, assignedByUserId: actor.userId,
            } });
          })();
      await status(tx, tenant.organizationId, instance.id, instance.operationalStatus, "PICKING", actor, orderId);
      await tx.order.update({ where: { id: orderId }, data: { readyAt: null, readyByUserId: null } });
      await orderEvent(tx, tenant.organizationId, orderId, "INSTANCE_ASSIGNED", actor.userId, { orderItemId, productInstanceId: instance.id, inventoryNumber: instance.inventoryNumber });
      return allocation;
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof FulfillmentError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2004") throw new FulfillmentError("INSTANCE_UNAVAILABLE", "Экземпляр уже назначен на пересекающийся период.");
    throw error;
  }
}

export async function unassignInstance(tenant: TenantContext, orderId: string, allocationId: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    await member(tx, tenant.organizationId, actor.userId);
    const allocation = await tx.capacityAllocation.findFirst({
      where: { id: allocationId, organizationId: tenant.organizationId, orderId, status: "ACTIVE", productInstanceId: { not: null } },
      include: { productInstance: true },
    });
    if (!allocation || !allocation.productInstance) throw new FulfillmentError("NOT_FOUND", "Назначение не найдено.");
    if (allocation.issuedAt) throw new FulfillmentError("INVALID_STATE", "Нельзя снять назначение после выдачи.");
    const aggregate = await tx.capacityAllocation.findFirst({ where: { organizationId: tenant.organizationId, orderItemId: allocation.orderItemId, status: "ACTIVE", productInstanceId: null } });
    if (aggregate) {
      await tx.capacityAllocation.update({ where: { id: aggregate.id }, data: { quantity: { increment: 1 } } });
      await tx.capacityAllocation.update({ where: { id: allocation.id }, data: { status: "RELEASED", releasedAt: new Date(), releaseReason: "INSTANCE_UNASSIGNED" } });
    } else {
      await tx.capacityAllocation.update({ where: { id: allocation.id }, data: { productInstanceId: null, assignedByUserId: null } });
    }
    await status(tx, tenant.organizationId, allocation.productInstance.id, allocation.productInstance.operationalStatus, "AVAILABLE", actor, orderId);
    await tx.order.update({ where: { id: orderId }, data: { readyAt: null, readyByUserId: null } });
    await orderEvent(tx, tenant.organizationId, orderId, "INSTANCE_UNASSIGNED", actor.userId, { orderItemId: allocation.orderItemId, productInstanceId: allocation.productInstance.id });
  });
}

async function fulfillmentOrder(tx: Prisma.TransactionClient, tenant: TenantContext, orderId: string) {
  const order = await tx.order.findFirst({
    where: { id: orderId, organizationId: tenant.organizationId },
    include: { items: { where: { removedAt: null }, include: { productVariant: { select: { product: { select: { trackingMode: true } } } }, capacityAllocations: { where: { status: "ACTIVE" }, include: { productInstance: true } } } } },
  });
  if (!order) throw new FulfillmentError("NOT_FOUND", "Заказ не найден.");
  return order;
}

function assertFullyAssigned(order: Awaited<ReturnType<typeof fulfillmentOrder>>) {
  for (const item of order.items) {
    if (item.capacityAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== item.quantity)
      throw new FulfillmentError("INVALID_STATE", "Бронирование позиции больше не соответствует заказу.");
    if (item.productVariant.product.trackingMode === "SERIALIZED") {
      const assigned = item.capacityAllocations.filter((a) => a.productInstanceId).length;
      if (assigned !== item.quantity) throw new FulfillmentError("INVALID_STATE", "Сначала назначьте все физические экземпляры.");
    }
  }
}

export async function markOrderReady(tenant: TenantContext, orderId: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    await member(tx, tenant.organizationId, actor.userId);
    const order = await fulfillmentOrder(tx, tenant, orderId);
    if (order.status !== "CONFIRMED") throw new FulfillmentError("INVALID_STATE", "Готовить к выдаче можно только подтверждённый заказ.");
    assertFullyAssigned(order);
    const now = new Date();
    for (const item of order.items) for (const allocation of item.capacityAllocations) if (allocation.productInstance) {
      if (allocation.productInstance.organizationId !== tenant.organizationId || allocation.productInstance.productVariantId !== item.productVariantId || allocation.productInstance.currentBranchId !== order.branchId || allocation.productInstance.retiredAt || allocation.productInstance.operationalStatus !== "PICKING")
        throw new FulfillmentError("INSTANCE_UNAVAILABLE", "Назначенный экземпляр больше не готов к комплектации.");
      await status(tx, tenant.organizationId, allocation.productInstance.id, "PICKING", "READY_FOR_PICKUP", actor, orderId);
    }
    await tx.order.update({ where: { id: orderId }, data: { readyAt: now, readyByUserId: actor.userId } });
    await orderEvent(tx, tenant.organizationId, orderId, "ORDER_READY", actor.userId, { readyAt: now.toISOString() });
  });
}

export async function issueOrder(tenant: TenantContext, orderId: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    await member(tx, tenant.organizationId, actor.userId);
    const order = await fulfillmentOrder(tx, tenant, orderId);
    if (order.status !== "CONFIRMED") throw new FulfillmentError("INVALID_STATE", "Выдать можно только подтверждённый заказ.");
    if (!order.readyAt) throw new FulfillmentError("INVALID_STATE", "Сначала отметьте заказ готовым к выдаче.");
    assertFullyAssigned(order);
    const now = new Date();
    for (const item of order.items) {
      for (const allocation of item.capacityAllocations) {
        if (allocation.issuedAt) throw new FulfillmentError("INVALID_STATE", "Позиция уже была выдана.");
        if (allocation.productInstance) {
          if (allocation.productInstance.organizationId !== tenant.organizationId || allocation.productInstance.productVariantId !== item.productVariantId || allocation.productInstance.currentBranchId !== order.branchId || allocation.productInstance.retiredAt || allocation.productInstance.operationalStatus !== "READY_FOR_PICKUP") throw new FulfillmentError("INVALID_STATE", "Назначенные экземпляры больше не готовы к выдаче.");
          await status(tx, tenant.organizationId, allocation.productInstance.id, allocation.productInstance.operationalStatus, "RENTED", actor, orderId);
        } else if (item.productVariant.product.trackingMode !== "BULK") {
          throw new FulfillmentError("INVALID_STATE", "Сериализованный экземпляр не назначен.");
        }
        await tx.capacityAllocation.update({ where: { id: allocation.id }, data: { issuedAt: now, issuedByUserId: actor.userId, issuedQuantity: allocation.quantity } });
      }
      await tx.orderItem.update({ where: { id: item.id }, data: { status: "ISSUED" } });
    }
    await orderEvent(tx, tenant.organizationId, orderId, "ITEMS_ISSUED", actor.userId, { issuedAt: now.toISOString(), serializedCount: order.items.flatMap((i) => i.capacityAllocations).filter((a) => a.productInstanceId).length });
    return now;
  }, { maxWait: 10_000, timeout: 30_000 });
}
