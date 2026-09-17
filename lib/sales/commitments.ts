import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import type { AuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { requireUserBranchAccess } from "@/lib/staff/branch-access";
import { lockOrderFinance } from "@/lib/finance/order-lock";
import { lockCapacityResources, lockInstanceResources } from "@/lib/inventory/capacity-lock";
import { getPermanentFleetReductionAvailabilityWithClient } from "@/lib/availability/capacity";

type Actor = Pick<AuthContext, "userId" | "membershipId" | "role">;
export type SaleCommitmentInput = {
  orderItemId: string;
  productVariantId: string;
  productInstanceId?: string;
  quantity: number;
  idempotencyKey: string;
  provenance?: string;
};

export class SaleCommitmentError extends Error {
  constructor(public readonly code: "INVALID" | "NOT_FOUND" | "CONFLICT" | "CAPACITY", message: string) {
    super(message);
  }
}

function validateInput(rows: SaleCommitmentInput[]) {
  if (!rows.length) throw new SaleCommitmentError("INVALID", "Добавьте товар для продажи.");
  for (const row of rows) {
    if (!Number.isInteger(row.quantity) || row.quantity <= 0) throw new SaleCommitmentError("INVALID", "Количество должно быть положительным.");
    if (!row.idempotencyKey.trim() || row.idempotencyKey.trim().length > 150) throw new SaleCommitmentError("INVALID", "Некорректный ключ операции.");
    if ((row.provenance?.trim().length ?? 0) > 80) throw new SaleCommitmentError("INVALID", "Некорректный источник операции.");
  }
}

function same(existing: {
  orderId: string; orderItemId: string; productVariantId: string; productInstanceId: string | null;
  branchId: string; quantity: number; provenance: string;
}, orderId: string, branchId: string, row: SaleCommitmentInput) {
  return existing.orderId === orderId && existing.orderItemId === row.orderItemId
    && existing.productVariantId === row.productVariantId
    && existing.productInstanceId === (row.productInstanceId ?? null)
    && existing.branchId === branchId && existing.quantity === row.quantity
    && existing.provenance === (row.provenance?.trim() || "SALE_CONFIRMATION");
}

export async function createSaleInventoryCommitments(
  tenant: TenantContext,
  orderId: string,
  rows: SaleCommitmentInput[],
  actor: Actor,
  confirmedAt = new Date()
) {
  validateInput(rows);
  await requirePermission({ organizationId: tenant.organizationId, membershipId: actor.membershipId, role: actor.role }, "SALE_CONFIRM");
  return db.$transaction(async (tx) => {
    await lockOrderFinance(tx, tenant.organizationId, orderId);
    const locked = await tx.$queryRaw<Array<{ id: string; branch_id: string }>>(Prisma.sql`
      SELECT "id","branch_id" FROM "orders"
      WHERE "id"=${orderId}::uuid AND "organization_id"=${tenant.organizationId}::uuid
      FOR UPDATE
    `);
    const order = await tx.order.findFirst({
      where: { id: orderId, organizationId: tenant.organizationId },
      select: { id: true, branchId: true, type: true, status: true }
    });
    if (!locked[0] || !order) throw new SaleCommitmentError("NOT_FOUND", "Заказ не найден.");
    await requireUserBranchAccess(tx, tenant, actor.userId, order.branchId);
    if (order.type !== "SALE" || order.status !== "CONFIRMED") throw new SaleCommitmentError("INVALID", "Товар можно закрепить только за подтверждённой продажей.");

    await lockCapacityResources(tx, rows.map((row) => ({ organizationId: tenant.organizationId, branchId: order.branchId, productVariantId: row.productVariantId })));
    await lockInstanceResources(tx, tenant.organizationId, rows.flatMap((row) => row.productInstanceId ? [row.productInstanceId] : []));

    const result = [];
    for (const row of rows) {
      const key = row.idempotencyKey.trim();
      const provenance = row.provenance?.trim() || "SALE_CONFIRMATION";
      const replay = await tx.saleInventoryCommitment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: tenant.organizationId, idempotencyKey: key } } });
      if (replay) {
        if (!same(replay, order.id, order.branchId, row)) throw new SaleCommitmentError("CONFLICT", "Ключ операции уже использован с другими данными.");
        result.push(replay);
        continue;
      }
      const item = await tx.orderItem.findFirst({
        where: { id: row.orderItemId, organizationId: tenant.organizationId, orderId: order.id, productVariantId: row.productVariantId, removedAt: null },
        include: { productVariant: { include: { product: { select: { trackingMode: true } } } } }
      });
      if (!item) throw new SaleCommitmentError("NOT_FOUND", "Позиция продажи не найдена.");
      const committedForItem = await tx.saleInventoryCommitment.aggregate({
        where: { organizationId: tenant.organizationId, orderItemId: item.id, status: { not: "CANCELLED" } },
        _sum: { quantity: true }
      });
      if ((committedForItem._sum.quantity ?? 0) + row.quantity > item.quantity) {
        throw new SaleCommitmentError("CONFLICT", "Количество закреплений превышает количество в позиции продажи.");
      }
      const mode = item.productVariant.product.trackingMode;
      if (mode === "BULK" && row.productInstanceId) throw new SaleCommitmentError("INVALID", "Для количественного товара экземпляр не выбирается.");
      if (mode === "SERIALIZED" && (!row.productInstanceId || row.quantity !== 1)) throw new SaleCommitmentError("INVALID", "Для поэкземплярного товара выберите один экземпляр.");
      if (row.productInstanceId) {
        const instance = await tx.productInstance.findFirst({
          where: {
            id: row.productInstanceId, organizationId: tenant.organizationId, productVariantId: row.productVariantId,
            currentBranchId: order.branchId, operationalStatus: "AVAILABLE", retiredAt: null,
            saleInventoryCommitments: { none: { status: "ACTIVE" } },
            capacityAllocations: { none: { status: "ACTIVE", OR: [{ blockedUntil: null }, { blockedUntil: { gt: confirmedAt } }] } }
          }, select: { id: true }
        });
        if (!instance) throw new SaleCommitmentError("CONFLICT", "Экземпляр недоступен для продажи.");
      }
      const capacity = await getPermanentFleetReductionAvailabilityWithClient(tx, {
        tenant, branchId: order.branchId, productVariantId: row.productVariantId, quantity: row.quantity, confirmedAt
      });
      if (!capacity.canFulfill) throw new SaleCommitmentError("CAPACITY", `Недостаточно постоянной вместимости: доступно ${capacity.availableCapacity}.`);
      result.push(await tx.saleInventoryCommitment.create({ data: {
        organizationId: tenant.organizationId, orderId: order.id, orderItemId: item.id,
        productVariantId: row.productVariantId, productInstanceId: row.productInstanceId,
        branchId: order.branchId, quantity: row.quantity, idempotencyKey: key, provenance,
        confirmedAt, confirmedByUserId: actor.userId
      } }));
    }
    return result;
  }, { maxWait: 10_000, timeout: 30_000 });
}
