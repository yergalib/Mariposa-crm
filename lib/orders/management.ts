import "server-only";
import { Prisma, type OrderStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { reserveOrderItemsWithClient } from "@/lib/availability/capacity";
import { InsufficientCapacityError } from "@/lib/availability/errors";
import { OrderError } from "@/lib/orders/errors";
import {
  cancellationSchema,
  orderItemSchema,
  orderSchema,
} from "@/lib/orders/validation";
type Actor = { userId?: string };
type ItemInput = {
  productVariantId: string;
  quantity: number;
  unitPriceMinor?: bigint;
  discountMinor?: bigint;
  adjustmentReason?: string | null;
};
const editable = (s: OrderStatus) =>
  ["DRAFT", "RESERVED", "CONFIRMED"].includes(s);
async function number(tx: Prisma.TransactionClient, org: string) {
  const r = await tx.$queryRaw<Array<{ value: bigint }>>(
    Prisma.sql`INSERT INTO "order_counters"("organization_id","next_value","updated_at") VALUES(${org}::uuid,2,CURRENT_TIMESTAMP) ON CONFLICT("organization_id") DO UPDATE SET "next_value"="order_counters"."next_value"+1,"updated_at"=CURRENT_TIMESTAMP RETURNING "next_value"-1 AS value`,
  );
  if (!r[0])
    throw new OrderError("VALIDATION", "Не удалось создать номер заказа.");
  return `R-${r[0].value.toString().padStart(6, "0")}`;
}
async function event(
  tx: Prisma.TransactionClient,
  org: string,
  orderId: string,
  type: string,
  actor?: string,
  fromStatus?: OrderStatus,
  toStatus?: OrderStatus,
  payload?: Prisma.InputJsonValue,
) {
  await tx.orderEvent.create({
    data: {
      organizationId: org,
      orderId,
      eventType: type,
      createdByUserId: actor,
      fromStatus,
      toStatus,
      payload,
    },
  });
}
async function roots(
  tx: Prisma.TransactionClient,
  org: string,
  branchId: string,
  customerId: string,
  userId?: string,
) {
  const [b, c, u] = await Promise.all([
    tx.branch.findFirst({
      where: { id: branchId, organizationId: org, status: "ACTIVE" },
      select: { id: true },
    }),
    tx.customer.findFirst({
      where: {
        id: customerId,
        organizationId: org,
        status: { not: "ARCHIVED" },
      },
      select: { id: true },
    }),
    userId
      ? tx.organizationMembership.findFirst({
          where: { organizationId: org, userId, status: "ACTIVE" },
          select: { id: true },
        })
      : Promise.resolve({ id: "system" }),
  ]);
  if (!b || !c || !u)
    throw new OrderError(
      "NOT_FOUND",
      "Филиал, клиент или сотрудник не найден.",
    );
}
async function snapshot(
  tx: Prisma.TransactionClient,
  org: string,
  branchId: string,
  raw: ItemInput,
) {
  const i = orderItemSchema.parse(raw),
    now = new Date();
  const v = await tx.productVariant.findFirst({
    where: {
      id: i.productVariantId,
      organizationId: org,
      isActive: true,
      product: { archivedAt: null, isRentable: true },
    },
    select: {
      id: true,
      sku: true,
      size: { select: { name: true, code: true } },
      product: { select: { name: true } },
      prices: {
        where: {
          organizationId: org,
          type: "RENTAL",
          validFrom: { lte: now },
          AND: [
            { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
            { OR: [{ branchId }, { branchId: null }] },
          ],
        },
        orderBy: [{ branchId: "desc" }, { validFrom: "desc" }],
        take: 1,
      },
    },
  });
  if (!v) throw new OrderError("NOT_FOUND", "Вариант товара не найден.");
  const price = i.unitPriceMinor ?? v.prices[0]?.amountMinor;
  if (price === undefined)
    throw new OrderError(
      "PRICE_NOT_FOUND",
      "Для варианта не задана актуальная цена аренды.",
    );
  const gross = price * BigInt(i.quantity);
  if (i.discountMinor > gross)
    throw new OrderError(
      "VALIDATION",
      "Скидка позиции превышает её стоимость.",
    );
  return {
    organizationId: org,
    productVariantId: v.id,
    quantity: i.quantity,
    unitPriceMinor: price,
    discountTotalMinor: i.discountMinor,
    lineTotalMinor: gross - i.discountMinor,
    currency: v.prices[0]?.currency ?? "KZT",
    productNameSnapshot: v.product.name,
    variantNameSnapshot: v.size.name || v.size.code,
    skuSnapshot: v.sku,
    adjustmentReason: i.adjustmentReason ?? null,
  };
}
async function totals(
  tx: Prisma.TransactionClient,
  orderId: string,
  discount?: bigint,
) {
  const rows = await tx.orderItem.findMany({
    where: { orderId, removedAt: null },
    select: { unitPriceMinor: true, quantity: true, discountTotalMinor: true },
  });
  const zero = BigInt(0),
    subtotal = rows.reduce(
      (s, x) => s + x.unitPriceMinor * BigInt(x.quantity),
      zero,
    ),
    lineDiscount = rows.reduce((s, x) => s + x.discountTotalMinor, zero),
    d = discount ?? zero;
  if (d > subtotal - lineDiscount)
    throw new OrderError("VALIDATION", "Скидка заказа превышает стоимость.");
  return {
    subtotalMinor: subtotal,
    discountTotalMinor: d,
    totalMinor: subtotal - lineDiscount - d,
    balanceDueMinor: subtotal - lineDiscount - d,
  };
}
async function replace(
  tx: Prisma.TransactionClient,
  tenant: TenantContext,
  orderId: string,
) {
  const o = await tx.order.findFirst({
    where: { id: orderId, organizationId: tenant.organizationId },
    include: { items: { where: { removedAt: null } } },
  });
  if (!o || !o.rentalStartAt || !o.rentalEndAt)
    throw new OrderError("NOT_FOUND", "Заказ не найден.");
  await reserveOrderItemsWithClient(tx, {
    tenant,
    branchId: o.branchId,
    orderId: o.id,
    requestedFrom: o.rentalStartAt,
    requestedUntil: o.rentalEndAt,
    items: o.items.map((x) => ({
      id: x.id,
      productVariantId: x.productVariantId,
      quantity: x.quantity,
    })),
    replaceExisting: true,
  });
  await tx.orderItem.updateMany({
    where: { orderId: o.id, organizationId: tenant.organizationId },
    data: { status: "RESERVED" },
  });
}
export async function createOrder(
  tenant: TenantContext,
  raw: unknown,
  items: ItemInput[],
  actor: Actor,
) {
  const o = orderSchema.parse(raw);
  if (!items.length)
    throw new OrderError("VALIDATION", "Добавьте хотя бы одну позицию.");
  return db.$transaction(
    async (tx) => {
      await roots(
        tx,
        tenant.organizationId,
        o.branchId,
        o.customerId,
        actor.userId,
      );
      const n = await number(tx, tenant.organizationId);
      const created = await tx.order.create({
        data: {
          organizationId: tenant.organizationId,
          orderNumber: n,
          branchId: o.branchId,
          customerId: o.customerId,
          type: "RENTAL",
          channel: o.source,
          status: "DRAFT",
          currency: "KZT",
          rentalStartAt: o.rentalStart,
          rentalEndAt: o.rentalEnd,
          expectedReturnAt: o.rentalEnd,
          discountTotalMinor: o.discountMinor,
          internalComment: o.internalComment,
          createdByUserId: actor.userId,
        },
      });
      for (const rawItem of items) {
        await tx.orderItem.create({
          data: {
            ...(await snapshot(tx, tenant.organizationId, o.branchId, rawItem)),
            orderId: created.id,
            status: "DRAFT",
          },
        });
      }
      await tx.order.update({
        where: { id: created.id },
        data: await totals(tx, created.id, o.discountMinor),
      });
      await event(
        tx,
        tenant.organizationId,
        created.id,
        "ORDER_CREATED",
        actor.userId,
        undefined,
        "DRAFT",
        { itemCount: items.length },
      );
      return created;
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
export async function updateOrder(
  tenant: TenantContext,
  id: string,
  raw: unknown,
  actor: Actor,
) {
  const o = orderSchema.parse(raw);
  return db.$transaction(
    async (tx) => {
      const old = await tx.order.findFirst({
        where: { id, organizationId: tenant.organizationId },
        select: { status: true },
      });
      if (!old) throw new OrderError("NOT_FOUND", "Заказ не найден.");
      if (!editable(old.status))
        throw new OrderError(
          "INVALID_STATE",
          "Заказ в этом статусе нельзя редактировать.",
        );
      await roots(
        tx,
        tenant.organizationId,
        o.branchId,
        o.customerId,
        actor.userId,
      );
      await tx.order.update({
        where: { id },
        data: {
          branchId: o.branchId,
          customerId: o.customerId,
          channel: o.source,
          rentalStartAt: o.rentalStart,
          rentalEndAt: o.rentalEnd,
          expectedReturnAt: o.rentalEnd,
          discountTotalMinor: o.discountMinor,
          internalComment: o.internalComment,
          version: { increment: 1 },
        },
      });
      await tx.order.update({
        where: { id },
        data: await totals(tx, id, o.discountMinor),
      });
      if (old.status !== "DRAFT") await replace(tx, tenant, id);
      await event(
        tx,
        tenant.organizationId,
        id,
        old.status === "DRAFT" ? "ORDER_UPDATED" : "RESERVATION_CHANGED",
        actor.userId,
        old.status,
        old.status,
        { datesChanged: true },
      );
      return tx.order.findUniqueOrThrow({ where: { id } });
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
export async function addOrderItem(
  tenant: TenantContext,
  orderId: string,
  raw: ItemInput,
  actor: Actor,
) {
  return db.$transaction(
    async (tx) => {
      const o = await tx.order.findFirst({
        where: { id: orderId, organizationId: tenant.organizationId },
        select: { status: true, branchId: true, discountTotalMinor: true },
      });
      if (!o || !editable(o.status))
        throw new OrderError("INVALID_STATE", "Заказ нельзя редактировать.");
      const item = await tx.orderItem.create({
        data: {
          ...(await snapshot(tx, tenant.organizationId, o.branchId, raw)),
          organizationId: tenant.organizationId,
          orderId,
          status: o.status === "DRAFT" ? "DRAFT" : "RESERVED",
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: await totals(tx, orderId, o.discountTotalMinor),
      });
      if (o.status !== "DRAFT") await replace(tx, tenant, orderId);
      await event(
        tx,
        tenant.organizationId,
        orderId,
        "ITEM_ADDED",
        actor.userId,
        o.status,
        o.status,
        { orderItemId: item.id },
      );
      return item;
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
export async function updateOrderItem(
  tenant: TenantContext,
  orderId: string,
  itemId: string,
  raw: ItemInput,
  actor: Actor,
) {
  return db.$transaction(
    async (tx) => {
      const o = await tx.order.findFirst({
        where: { id: orderId, organizationId: tenant.organizationId },
        select: { status: true, branchId: true, discountTotalMinor: true },
      });
      if (!o || !editable(o.status))
        throw new OrderError("INVALID_STATE", "Заказ нельзя редактировать.");
      const exists = await tx.orderItem.findFirst({
        where: { id: itemId, orderId, organizationId: tenant.organizationId, removedAt: null },
        select: { id: true },
      });
      if (!exists) throw new OrderError("NOT_FOUND", "Позиция не найдена.");
      await tx.orderItem.update({
        where: { id: itemId },
        data: await snapshot(tx, tenant.organizationId, o.branchId, raw),
      });
      await tx.order.update({
        where: { id: orderId },
        data: await totals(tx, orderId, o.discountTotalMinor),
      });
      if (o.status !== "DRAFT") await replace(tx, tenant, orderId);
      await event(
        tx,
        tenant.organizationId,
        orderId,
        "ITEM_UPDATED",
        actor.userId,
        o.status,
        o.status,
        { orderItemId: itemId },
      );
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
export async function removeOrderItem(
  tenant: TenantContext,
  orderId: string,
  itemId: string,
  actor: Actor,
) {
  return db.$transaction(
    async (tx) => {
      const o = await tx.order.findFirst({
        where: { id: orderId, organizationId: tenant.organizationId },
        include: { items: { where: { removedAt: null }, select: { id: true } } },
      });
      if (!o || !editable(o.status) || o.items.length < 2)
        throw new OrderError(
          "INVALID_STATE",
          "В заказе должна остаться хотя бы одна позиция.",
        );
      if (!o.items.some((x) => x.id === itemId))
        throw new OrderError("NOT_FOUND", "Позиция не найдена.");
      await tx.capacityAllocation.updateMany({
        where: {
          organizationId: tenant.organizationId,
          orderItemId: itemId,
          status: "ACTIVE",
        },
        data: {
          status: "RELEASED",
          releasedAt: new Date(),
          releaseReason: "ORDER_ITEM_REMOVED",
        },
      });
      await tx.orderItem.update({ where: { id: itemId }, data: { status: "CANCELLED", removedAt: new Date() } });
      await tx.order.update({
        where: { id: orderId },
        data: await totals(tx, orderId, o.discountTotalMinor),
      });
      if (o.status !== "DRAFT") await replace(tx, tenant, orderId);
      await event(
        tx,
        tenant.organizationId,
        orderId,
        "ITEM_REMOVED",
        actor.userId,
        o.status,
        o.status,
        { orderItemId: itemId },
      );
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
export async function reserveOrder(
  tenant: TenantContext,
  id: string,
  actor: Actor,
) {
  try {
    return await db.$transaction(
      async (tx) => {
        const o = await tx.order.findFirst({
          where: { id, organizationId: tenant.organizationId },
          include: { items: { where: { removedAt: null } } },
        });
        if (
          !o ||
          o.status !== "DRAFT" ||
          !o.items.length ||
          !o.rentalStartAt ||
          !o.rentalEndAt
        )
          throw new OrderError(
            "INVALID_STATE",
            "Зарезервировать можно только заполненный черновик.",
          );
        await reserveOrderItemsWithClient(tx, {
          tenant,
          branchId: o.branchId,
          orderId: o.id,
          requestedFrom: o.rentalStartAt,
          requestedUntil: o.rentalEndAt,
          items: o.items.map((x) => ({
            id: x.id,
            productVariantId: x.productVariantId,
            quantity: x.quantity,
          })),
        });
        await tx.orderItem.updateMany({
          where: { orderId: id, organizationId: tenant.organizationId },
          data: { status: "RESERVED" },
        });
        const r = await tx.order.update({
          where: { id },
          data: { status: "RESERVED", version: { increment: 1 } },
        });
        await event(
          tx,
          tenant.organizationId,
          id,
          "RESERVATION_CREATED",
          actor.userId,
          "DRAFT",
          "RESERVED",
        );
        return r;
      },
      { maxWait: 10000, timeout: 30000 },
    );
  } catch (e) {
    if (e instanceof InsufficientCapacityError)
      throw new OrderError("CAPACITY", e.message);
    throw e;
  }
}
export async function confirmOrder(
  tenant: TenantContext,
  id: string,
  actor: Actor,
) {
  return db.$transaction(async (tx) => {
    const o = await tx.order.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: { status: true },
    });
    if (!o) throw new OrderError("NOT_FOUND", "Заказ не найден.");
    if (o.status !== "RESERVED")
      throw new OrderError(
        "INVALID_STATE",
        "Подтвердить можно только зарезервированный заказ.",
      );
    const r = await tx.order.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await event(
      tx,
      tenant.organizationId,
      id,
      "ORDER_CONFIRMED",
      actor.userId,
      "RESERVED",
      "CONFIRMED",
    );
    return r;
  });
}
export async function cancelOrder(
  tenant: TenantContext,
  id: string,
  reasonRaw: string,
  actor: Actor,
) {
  const reason = cancellationSchema.parse(reasonRaw);
  return db.$transaction(async (tx) => {
    const o = await tx.order.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: { status: true },
    });
    if (!o) throw new OrderError("NOT_FOUND", "Заказ не найден.");
    if (o.status === "CANCELLED") return o;
    if (!["DRAFT", "RESERVED", "CONFIRMED"].includes(o.status))
      throw new OrderError("INVALID_STATE", "Этот заказ нельзя отменить.");
    await tx.capacityAllocation.updateMany({
      where: {
        organizationId: tenant.organizationId,
        orderId: id,
        status: "ACTIVE",
      },
      data: {
        status: "CANCELLED",
        releasedAt: new Date(),
        releaseReason: reason,
      },
    });
    await tx.orderItem.updateMany({
      where: { organizationId: tenant.organizationId, orderId: id },
      data: { status: "CANCELLED" },
    });
    const r = await tx.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: reason,
        version: { increment: 1 },
      },
    });
    await event(
      tx,
      tenant.organizationId,
      id,
      "ORDER_CANCELLED",
      actor.userId,
      o.status,
      "CANCELLED",
      { reason },
    );
    return r;
  });
}
