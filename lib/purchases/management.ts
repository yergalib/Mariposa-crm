import "server-only";
import { Prisma, type PurchaseItem } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import type { AuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { requireUserBranchAccess } from "@/lib/staff/branch-access";
import { appendAuditLog } from "@/lib/audit/log";
import { PurchaseError } from "@/lib/purchases/errors";
import {
  purchaseHeaderSchema,
  purchaseItemSchema,
  supplierSchema,
} from "@/lib/purchases/validation";

type Actor = Pick<AuthContext, "userId" | "membershipId" | "role">;
type ItemInput = {
  productVariantId: string;
  orderedQuantity: number;
  unitCostMinor: bigint;
  lineDiscountMinor: bigint;
  note?: string | null;
};
type HeaderInput = {
  supplierId: string;
  destinationBranchId: string;
  currency: string;
  additionalCostMinor: bigint;
  externalReference?: string | null;
  note?: string | null;
  idempotencyKey: string;
};
const permissionContext = (t: TenantContext, a: Actor) => ({
  organizationId: t.organizationId,
  membershipId: a.membershipId,
  role: a.role,
});
const text = (v: string | null | undefined) => v?.trim() || null;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

async function lock(
  tx: Prisma.TransactionClient,
  organizationId: string,
  purchaseId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId + ":purchase:" + purchaseId},0))`;
}
async function purchaseNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  const rows = await tx.$queryRaw<
    Array<{ value: bigint }>
  >`INSERT INTO "purchase_counters"("organization_id","next_value","updated_at") VALUES(${organizationId}::uuid,2,CURRENT_TIMESTAMP) ON CONFLICT("organization_id") DO UPDATE SET "next_value"="purchase_counters"."next_value"+1,"updated_at"=CURRENT_TIMESTAMP RETURNING "next_value"-1 AS value`;
  if (!rows[0])
    throw new PurchaseError("INVALID", "Не удалось создать номер закупки.");
  return `P-${rows[0].value.toString().padStart(6, "0")}`;
}
async function roots(
  tx: Prisma.TransactionClient,
  t: TenantContext,
  supplierId: string,
  branchId: string,
  a: Actor,
  activeSupplier = true,
) {
  await requireUserBranchAccess(tx, t, a.userId, branchId);
  const [supplier, branch] = await Promise.all([
    tx.supplier.findFirst({
      where: {
        id: supplierId,
        organizationId: t.organizationId,
        status: activeSupplier ? "ACTIVE" : undefined,
      },
      select: { id: true },
    }),
    tx.branch.findFirst({
      where: {
        id: branchId,
        organizationId: t.organizationId,
        status: "ACTIVE",
      },
      select: { id: true },
    }),
  ]);
  if (!supplier || !branch)
    throw new PurchaseError("NOT_FOUND", "Поставщик или филиал недоступен.");
}
async function snapshot(
  tx: Prisma.TransactionClient,
  t: TenantContext,
  input: ItemInput,
  currency: string,
  sortOrder: number,
) {
  const item = purchaseItemSchema.parse(input);
  const variant = await tx.productVariant.findFirst({
    where: {
      id: item.productVariantId,
      organizationId: t.organizationId,
      isActive: true,
      product: { archivedAt: null },
    },
    select: {
      id: true,
      sku: true,
      size: { select: { name: true, code: true } },
      product: { select: { name: true, supplierModel: true } },
    },
  });
  if (!variant)
    throw new PurchaseError("NOT_FOUND", "Вариант товара недоступен.");
  return {
    organizationId: t.organizationId,
    productVariantId: variant.id,
    orderedQuantity: item.orderedQuantity,
    unitCostMinor: item.unitCostMinor,
    lineDiscountMinor: item.lineDiscountMinor,
    allocatedAdditionalCostMinor: BigInt(0),
    lineTotalMinor:
      item.unitCostMinor * BigInt(item.orderedQuantity) -
      item.lineDiscountMinor,
    currency,
    productNameSnapshot: variant.product.name,
    variantNameSnapshot: variant.size.name || variant.size.code,
    skuSnapshot: variant.sku,
    supplierModelSnapshot: variant.product.supplierModel,
    note: item.note,
    sortOrder,
  };
}

export function allocateAdditionalCost(
  items: ReadonlyArray<
    Pick<
      PurchaseItem,
      | "id"
      | "unitCostMinor"
      | "orderedQuantity"
      | "lineDiscountMinor"
      | "sortOrder"
    >
  >,
  additional: bigint,
) {
  if (additional < BigInt(0))
    throw new PurchaseError(
      "INVALID",
      "Дополнительные расходы не могут быть отрицательными.",
    );
  const ordered = [...items].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    ),
    weights = ordered.map(
      (i) => i.unitCostMinor * BigInt(i.orderedQuantity) - i.lineDiscountMinor,
    ),
    base = weights.reduce((s, v) => s + v, BigInt(0));
  if (additional > BigInt(0) && base === BigInt(0))
    throw new PurchaseError(
      "INVALID",
      "Нельзя распределить расходы между позициями с нулевой стоимостью.",
    );
  let used = BigInt(0);
  return ordered.map((item, index) => {
    const value =
      index === ordered.length - 1
        ? additional - used
        : base === BigInt(0)
          ? BigInt(0)
          : (additional * weights[index]!) / base;
    used += value;
    return { id: item.id, value };
  });
}
async function recalculate(tx: Prisma.TransactionClient, purchaseId: string) {
  const purchase = await tx.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, additionalCostMinor: true, status: true },
  });
  if (!purchase || purchase.status !== "DRAFT")
    throw new PurchaseError(
      "INVALID_STATE",
      "Подтверждённую закупку нельзя редактировать.",
    );
  const items = await tx.purchaseItem.findMany({
    where: { purchaseId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const allocations = allocateAdditionalCost(
    items,
    purchase.additionalCostMinor,
  );
  for (const allocation of allocations) {
    const item = items.find((x) => x.id === allocation.id)!;
    await tx.purchaseItem.update({
      where: { id: item.id },
      data: {
        allocatedAdditionalCostMinor: allocation.value,
        lineTotalMinor:
          item.unitCostMinor * BigInt(item.orderedQuantity) -
          item.lineDiscountMinor +
          allocation.value,
      },
    });
  }
  const subtotal = items.reduce(
      (s, i) => s + i.unitCostMinor * BigInt(i.orderedQuantity),
      BigInt(0),
    ),
    discount = items.reduce((s, i) => s + i.lineDiscountMinor, BigInt(0));
  return tx.purchase.update({
    where: { id: purchaseId },
    data: {
      subtotalMinor: subtotal,
      lineDiscountTotalMinor: discount,
      totalMinor: subtotal - discount + purchase.additionalCostMinor,
      version: { increment: 1 },
    },
  });
}

export async function createSupplier(t: TenantContext, raw: unknown, a: Actor) {
  await requirePermission(permissionContext(t, a), "SUPPLIER_MANAGE");
  const input = supplierSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const row = await tx.supplier.create({
      data: { organizationId: t.organizationId, ...input },
    });
    await appendAuditLog(tx, {
      organizationId: t.organizationId,
      actorUserId: a.userId,
      actorMembershipId: a.membershipId,
      action: "SUPPLIER_CREATED",
      entityType: "Supplier",
      entityId: row.id,
      metadata: { supplierId: row.id },
    });
    return row;
  });
}
export async function updateSupplier(
  t: TenantContext,
  id: string,
  raw: unknown,
  a: Actor,
) {
  await requirePermission(permissionContext(t, a), "SUPPLIER_MANAGE");
  const input = supplierSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const old = await tx.supplier.findFirst({
      where: { id, organizationId: t.organizationId },
    });
    if (!old) throw new PurchaseError("NOT_FOUND", "Поставщик не найден.");
    const row = await tx.supplier.update({ where: { id }, data: input });
    await appendAuditLog(tx, {
      organizationId: t.organizationId,
      actorUserId: a.userId,
      actorMembershipId: a.membershipId,
      action: "SUPPLIER_EDITED",
      entityType: "Supplier",
      entityId: id,
      metadata: { supplierId: id },
    });
    return row;
  });
}
export async function archiveSupplier(t: TenantContext, id: string, a: Actor) {
  await requirePermission(permissionContext(t, a), "SUPPLIER_MANAGE");
  return db.$transaction(async (tx) => {
    const old = await tx.supplier.findFirst({
      where: { id, organizationId: t.organizationId },
    });
    if (!old) throw new PurchaseError("NOT_FOUND", "Поставщик не найден.");
    if (old.status === "ARCHIVED") return old;
    const row = await tx.supplier.update({
      where: { id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await appendAuditLog(tx, {
      organizationId: t.organizationId,
      actorUserId: a.userId,
      actorMembershipId: a.membershipId,
      action: "SUPPLIER_ARCHIVED",
      entityType: "Supplier",
      entityId: id,
      metadata: { supplierId: id },
    });
    return row;
  });
}

export async function createPurchase(
  t: TenantContext,
  rawHeader: HeaderInput,
  rawItems: ItemInput[],
  a: Actor,
) {
  await requirePermission(permissionContext(t, a), "PURCHASE_CREATE");
  await requirePermission(
    permissionContext(t, a),
    "FINANCE_PURCHASE_COST_VIEW",
  );
  const h = purchaseHeaderSchema.parse(rawHeader),
    items = rawItems.map((x) => purchaseItemSchema.parse(x));
  if (!items.length)
    throw new PurchaseError("INVALID", "Добавьте хотя бы одну позицию.");
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${t.organizationId + ":purchase-create:" + h.idempotencyKey},0))`;
      const replay = await tx.purchase.findUnique({
        where: {
          organizationId_creationIdempotencyKey: {
            organizationId: t.organizationId,
            creationIdempotencyKey: h.idempotencyKey,
          },
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
      if (replay) {
        const semantic = {
            supplierId: replay.supplierId,
            destinationBranchId: replay.destinationBranchId,
            currency: replay.currency,
            additionalCostMinor: replay.additionalCostMinor.toString(),
            externalReference: replay.externalReference,
            note: replay.note,
            items: replay.items.map((i) => ({
              productVariantId: i.productVariantId,
              orderedQuantity: i.orderedQuantity,
              unitCostMinor: i.unitCostMinor.toString(),
              lineDiscountMinor: i.lineDiscountMinor.toString(),
              note: i.note,
            })),
          },
          expected = {
            supplierId: h.supplierId,
            destinationBranchId: h.destinationBranchId,
            currency: h.currency,
            additionalCostMinor: h.additionalCostMinor.toString(),
            externalReference: h.externalReference,
            note: h.note,
            items: items.map((i) => ({
              productVariantId: i.productVariantId,
              orderedQuantity: i.orderedQuantity,
              unitCostMinor: i.unitCostMinor.toString(),
              lineDiscountMinor: i.lineDiscountMinor.toString(),
              note: i.note,
            })),
          };
        if (!same(semantic, expected))
          throw new PurchaseError(
            "CONFLICT",
            "Ключ операции уже использован с другими данными.",
          );
        return replay;
      }
      await roots(tx, t, h.supplierId, h.destinationBranchId, a);
      const initialSubtotal = items.reduce(
        (sum, item) =>
          sum + item.unitCostMinor * BigInt(item.orderedQuantity),
        BigInt(0),
      );
      const initialDiscount = items.reduce(
        (sum, item) => sum + item.lineDiscountMinor,
        BigInt(0),
      );
      const row = await tx.purchase.create({
        data: {
          organizationId: t.organizationId,
          purchaseNumber: await purchaseNumber(tx, t.organizationId),
          supplierId: h.supplierId,
          destinationBranchId: h.destinationBranchId,
          currency: h.currency,
          subtotalMinor: initialSubtotal,
          lineDiscountTotalMinor: initialDiscount,
          additionalCostMinor: h.additionalCostMinor,
          totalMinor:
            initialSubtotal - initialDiscount + h.additionalCostMinor,
          externalReference: h.externalReference,
          note: h.note,
          creationIdempotencyKey: h.idempotencyKey,
          createdByUserId: a.userId,
        },
      });
      for (let index = 0; index < items.length; index++)
        await tx.purchaseItem.create({
          data: {
            ...(await snapshot(tx, t, items[index]!, h.currency, index)),
            purchaseId: row.id,
          },
        });
      const result = await recalculate(tx, row.id);
      await appendAuditLog(tx, {
        organizationId: t.organizationId,
        branchId: h.destinationBranchId,
        actorUserId: a.userId,
        actorMembershipId: a.membershipId,
        action: "PURCHASE_CREATED",
        entityType: "Purchase",
        entityId: row.id,
        correlationId: h.idempotencyKey,
        metadata: {
          purchaseId: row.id,
          purchaseNumber: row.purchaseNumber,
          supplierId: h.supplierId,
          itemCount: items.length,
          additionalCostMinor: h.additionalCostMinor.toString(),
          totalMinor: result.totalMinor.toString(),
          currency: h.currency,
        },
      });
      return tx.purchase.findUniqueOrThrow({
        where: { id: row.id },
        include: { items: true },
      });
    },
    { maxWait: 10000, timeout: 30000 },
  );
}

export async function updatePurchaseHeader(
  t: TenantContext,
  id: string,
  raw: Omit<HeaderInput, "idempotencyKey"> & { expectedVersion: number },
  a: Actor,
) {
  await requirePermission(permissionContext(t, a), "PURCHASE_EDIT");
  await requirePermission(
    permissionContext(t, a),
    "FINANCE_PURCHASE_COST_VIEW",
  );
  const h = purchaseHeaderSchema.omit({ idempotencyKey: true }).parse(raw);
  return db.$transaction(async (tx) => {
    await lock(tx, t.organizationId, id);
    const p = await tx.purchase.findFirst({
      where: { id, organizationId: t.organizationId },
    });
    if (!p) throw new PurchaseError("NOT_FOUND", "Закупка не найдена.");
    if (p.status !== "DRAFT")
      throw new PurchaseError(
        "INVALID_STATE",
        "Подтверждённую закупку нельзя редактировать.",
      );
    if (p.version !== raw.expectedVersion)
      throw new PurchaseError(
        "CONFLICT",
        "Закупка уже была изменена. Обновите страницу.",
      );
    await roots(tx, t, h.supplierId, h.destinationBranchId, a);
    await tx.purchase.update({
      where: { id },
      data: {
        supplierId: h.supplierId,
        destinationBranchId: h.destinationBranchId,
        currency: h.currency,
        additionalCostMinor: h.additionalCostMinor,
        totalMinor:
          p.subtotalMinor -
          p.lineDiscountTotalMinor +
          h.additionalCostMinor,
        externalReference: h.externalReference,
        note: h.note,
      },
    });
    await tx.purchaseItem.updateMany({
      where: { purchaseId: id },
      data: { currency: h.currency },
    });
    const result = await recalculate(tx, id);
    await appendAuditLog(tx, {
      organizationId: t.organizationId,
      branchId: h.destinationBranchId,
      actorUserId: a.userId,
      actorMembershipId: a.membershipId,
      action: "PURCHASE_EDITED",
      entityType: "Purchase",
      entityId: id,
      metadata: {
        purchaseId: id,
        additionalCostMinor: h.additionalCostMinor.toString(),
        totalMinor: result.totalMinor.toString(),
        currency: h.currency,
      },
    });
    return result;
  });
}
export async function addPurchaseItem(
  t: TenantContext,
  purchaseId: string,
  input: ItemInput,
  a: Actor,
) {
  await requirePermission(permissionContext(t, a), "PURCHASE_EDIT");
  await requirePermission(
    permissionContext(t, a),
    "FINANCE_PURCHASE_COST_VIEW",
  );
  return db.$transaction(async (tx) => {
    await lock(tx, t.organizationId, purchaseId);
    const p = await tx.purchase.findFirst({
      where: { id: purchaseId, organizationId: t.organizationId },
    });
    if (!p) throw new PurchaseError("NOT_FOUND", "Закупка не найдена.");
    if (p.status !== "DRAFT")
      throw new PurchaseError(
        "INVALID_STATE",
        "Подтверждённую закупку нельзя редактировать.",
      );
    await requireUserBranchAccess(tx, t, a.userId, p.destinationBranchId);
    const count = await tx.purchaseItem.count({ where: { purchaseId } }),
      row = await tx.purchaseItem.create({
        data: {
          ...(await snapshot(tx, t, input, p.currency, count)),
          purchaseId,
        },
      });
    await recalculate(tx, purchaseId);
    await appendAuditLog(tx, {
      organizationId: t.organizationId,
      branchId: p.destinationBranchId,
      actorUserId: a.userId,
      actorMembershipId: a.membershipId,
      action: "PURCHASE_ITEM_ADDED",
      entityType: "Purchase",
      entityId: purchaseId,
      metadata: { purchaseId, itemCount: count + 1 },
    });
    return row;
  });
}
export async function updatePurchaseItem(
  t: TenantContext,
  purchaseId: string,
  itemId: string,
  input: ItemInput,
  a: Actor,
) {
  await requirePermission(permissionContext(t, a), "PURCHASE_EDIT");
  await requirePermission(
    permissionContext(t, a),
    "FINANCE_PURCHASE_COST_VIEW",
  );
  return db.$transaction(async (tx) => {
    await lock(tx, t.organizationId, purchaseId);
    const p = await tx.purchase.findFirst({
      where: {
        id: purchaseId,
        organizationId: t.organizationId,
        status: "DRAFT",
      },
    });
    if (!p)
      throw new PurchaseError("INVALID_STATE", "Черновик закупки недоступен.");
    await requireUserBranchAccess(tx, t, a.userId, p.destinationBranchId);
    const old = await tx.purchaseItem.findFirst({
      where: { id: itemId, purchaseId, organizationId: t.organizationId },
    });
    if (!old) throw new PurchaseError("NOT_FOUND", "Позиция не найдена.");
    await tx.purchaseItem.update({
      where: { id: itemId },
      data: await snapshot(tx, t, input, p.currency, old.sortOrder),
    });
    await recalculate(tx, purchaseId);
    await appendAuditLog(tx, {
      organizationId: t.organizationId,
      branchId: p.destinationBranchId,
      actorUserId: a.userId,
      actorMembershipId: a.membershipId,
      action: "PURCHASE_ITEM_EDITED",
      entityType: "Purchase",
      entityId: purchaseId,
      metadata: { purchaseId },
    });
  });
}
export async function removePurchaseItem(
  t: TenantContext,
  purchaseId: string,
  itemId: string,
  a: Actor,
) {
  await requirePermission(permissionContext(t, a), "PURCHASE_EDIT");
  await requirePermission(
    permissionContext(t, a),
    "FINANCE_PURCHASE_COST_VIEW",
  );
  return db.$transaction(async (tx) => {
    await lock(tx, t.organizationId, purchaseId);
    const p = await tx.purchase.findFirst({
      where: {
        id: purchaseId,
        organizationId: t.organizationId,
        status: "DRAFT",
      },
    });
    if (!p)
      throw new PurchaseError("INVALID_STATE", "Черновик закупки недоступен.");
    await requireUserBranchAccess(tx, t, a.userId, p.destinationBranchId);
    if (
      !(await tx.purchaseItem.findFirst({
        where: { id: itemId, purchaseId, organizationId: t.organizationId },
      }))
    )
      throw new PurchaseError("NOT_FOUND", "Позиция не найдена.");
    await tx.purchaseItem.delete({ where: { id: itemId } });
    await recalculate(tx, purchaseId);
    await appendAuditLog(tx, {
      organizationId: t.organizationId,
      branchId: p.destinationBranchId,
      actorUserId: a.userId,
      actorMembershipId: a.membershipId,
      action: "PURCHASE_ITEM_REMOVED",
      entityType: "Purchase",
      entityId: purchaseId,
      metadata: { purchaseId },
    });
  });
}

export async function confirmPurchase(
  t: TenantContext,
  id: string,
  idempotencyKey: string,
  a: Actor,
) {
  await requirePermission(permissionContext(t, a), "PURCHASE_EDIT");
  const key = idempotencyKey.trim();
  if (!key || key.length > 150)
    throw new PurchaseError("INVALID", "Некорректный ключ операции.");
  return db.$transaction(async (tx) => {
    await lock(tx, t.organizationId, id);
    const p = await tx.purchase.findFirst({
      where: { id, organizationId: t.organizationId },
      include: {
        supplier: { select: { status: true } },
        _count: { select: { items: true } },
      },
    });
    if (!p) throw new PurchaseError("NOT_FOUND", "Закупка не найдена.");
    await requireUserBranchAccess(tx, t, a.userId, p.destinationBranchId);
    if (p.status === "CONFIRMED") {
      if (p.confirmedIdempotencyKey === key) return p;
      throw new PurchaseError(
        "CONFLICT",
        "Закупка уже подтверждена другой операцией.",
      );
    }
    if (p.status !== "DRAFT")
      throw new PurchaseError(
        "INVALID_STATE",
        "Закупку нельзя подтвердить в текущем статусе.",
      );
    if (!p._count.items)
      throw new PurchaseError("INVALID", "Добавьте хотя бы одну позицию.");
    if (p.supplier.status !== "ACTIVE")
      throw new PurchaseError(
        "INVALID",
        "Архивного поставщика нельзя использовать для подтверждения.",
      );
    const row = await tx.purchase.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedByUserId: a.userId,
        confirmedIdempotencyKey: key,
        version: { increment: 1 },
      },
    });
    await appendAuditLog(tx, {
      organizationId: t.organizationId,
      branchId: p.destinationBranchId,
      actorUserId: a.userId,
      actorMembershipId: a.membershipId,
      action: "PURCHASE_CONFIRMED",
      entityType: "Purchase",
      entityId: id,
      correlationId: key,
      metadata: {
        purchaseId: id,
        purchaseNumber: p.purchaseNumber,
        status: "CONFIRMED",
        totalMinor: p.totalMinor.toString(),
        currency: p.currency,
      },
    });
    return row;
  });
}
export async function cancelPurchase(
  t: TenantContext,
  id: string,
  idempotencyKey: string,
  a: Actor,
) {
  await requirePermission(permissionContext(t, a), "PURCHASE_CANCEL");
  const key = idempotencyKey.trim();
  if (!key || key.length > 150)
    throw new PurchaseError("INVALID", "Некорректный ключ операции.");
  return db.$transaction(async (tx) => {
    await lock(tx, t.organizationId, id);
    const p = await tx.purchase.findFirst({
      where: { id, organizationId: t.organizationId },
    });
    if (!p) throw new PurchaseError("NOT_FOUND", "Закупка не найдена.");
    await requireUserBranchAccess(tx, t, a.userId, p.destinationBranchId);
    if (p.status === "CANCELLED") {
      if (p.cancelledIdempotencyKey === key) return p;
      throw new PurchaseError(
        "CONFLICT",
        "Закупка уже отменена другой операцией.",
      );
    }
    if (!["DRAFT", "CONFIRMED"].includes(p.status))
      throw new PurchaseError(
        "INVALID_STATE",
        "Закупку с историей приёмки нельзя отменить.",
      );
    const row = await tx.purchase.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledByUserId: a.userId,
        cancelledIdempotencyKey: key,
        version: { increment: 1 },
      },
    });
    await appendAuditLog(tx, {
      organizationId: t.organizationId,
      branchId: p.destinationBranchId,
      actorUserId: a.userId,
      actorMembershipId: a.membershipId,
      action: "PURCHASE_CANCELLED",
      entityType: "Purchase",
      entityId: id,
      correlationId: key,
      metadata: {
        purchaseId: id,
        purchaseNumber: p.purchaseNumber,
        status: "CANCELLED",
      },
    });
    return row;
  });
}
