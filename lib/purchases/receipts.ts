import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { appendAuditLog } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { movement } from "@/lib/inventory/ledger";
import { requirePermission } from "@/lib/permissions/effective";
import { PurchaseError } from "@/lib/purchases/errors";
import { requireUserBranchAccess } from "@/lib/staff/branch-access";
import type { TenantContext } from "@/lib/tenant/context";

type Actor = Pick<AuthContext, "userId" | "membershipId" | "role">;
type ReceiveInput = {
  purchaseId: string;
  purchaseItemId: string;
  locationId: string;
  quantity: number;
  receivedAt: Date;
  note?: string | null;
  idempotencyKey: string;
};
const pc = (t: TenantContext, a: Actor) => ({ organizationId: t.organizationId, membershipId: a.membershipId, role: a.role });
const clean = (value?: string | null) => value?.trim() || null;
const lockPurchase = (tx: Prisma.TransactionClient, organizationId: string, purchaseId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId + ":purchase:" + purchaseId},0))`;

function validateReceive(input: ReceiveInput) {
  if (!input.purchaseId || !input.purchaseItemId || !input.locationId || !input.idempotencyKey.trim())
    throw new PurchaseError("INVALID", "Не заполнены обязательные данные приёмки.");
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 500)
    throw new PurchaseError("INVALID", "Количество должно быть от 1 до 500.");
  if (!(input.receivedAt instanceof Date) || Number.isNaN(input.receivedAt.getTime()))
    throw new PurchaseError("INVALID", "Укажите корректную дату приёмки.");
  if (clean(input.note)?.length! > 1000) throw new PurchaseError("INVALID", "Комментарий слишком длинный.");
}

export async function receivePurchaseItem(t: TenantContext, input: ReceiveInput, a: Actor) {
  await requirePermission(pc(t, a), "PURCHASE_RECEIVE");
  validateReceive(input);
  return db.$transaction(async (tx) => {
    await lockPurchase(tx, t.organizationId, input.purchaseId);
    const purchase = await tx.purchase.findFirst({
      where: { id: input.purchaseId, organizationId: t.organizationId },
      include: {
        items: { include: { productVariant: { include: { product: { select: { trackingMode: true } } } }, receiptLines: true } },
        receipts: { select: { id: true } },
      },
    });
    if (!purchase) throw new PurchaseError("NOT_FOUND", "Закупка не найдена.");
    await requireUserBranchAccess(tx, t, a.userId, purchase.destinationBranchId);
    const replay = await tx.purchaseReceipt.findUnique({
      where: { organizationId_idempotencyKey: { organizationId: t.organizationId, idempotencyKey: input.idempotencyKey.trim() } },
      include: { lines: { include: { instances: true, bulkLayer: true } } },
    });
    if (replay) {
      if (replay.branchId !== purchase.destinationBranchId)
        await requireUserBranchAccess(tx, t, a.userId, replay.branchId);
      const line = replay.lines[0];
      if (replay.purchaseId !== input.purchaseId || replay.locationId !== input.locationId || replay.receivedAt.getTime() !== input.receivedAt.getTime() || replay.note !== clean(input.note) || !line || line.purchaseItemId !== input.purchaseItemId || line.quantity !== input.quantity)
        throw new PurchaseError("CONFLICT", "Ключ операции уже использован с другими данными.");
      return replay;
    }
    if (!['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(purchase.status))
      throw new PurchaseError("INVALID_STATE", "Приёмка доступна только для подтверждённой закупки.");
    const item = purchase.items.find((row) => row.id === input.purchaseItemId);
    if (!item) throw new PurchaseError("NOT_FOUND", "Позиция закупки не найдена.");
    const location = await tx.location.findFirst({ where: { id: input.locationId, organizationId: t.organizationId, branchId: purchase.destinationBranchId }, select: { id: true } });
    if (!location) throw new PurchaseError("NOT_FOUND", "Складская локация недоступна.");
    const alreadyQuantity = item.receiptLines.reduce((sum, row) => sum + row.quantity, 0);
    const alreadyCost = item.receiptLines.reduce((sum, row) => sum + row.totalAcquisitionCostMinor, BigInt(0));
    const cumulative = alreadyQuantity + input.quantity;
    if (cumulative > item.orderedQuantity) throw new PurchaseError("INVALID", "Количество превышает остаток по позиции закупки.");
    const cumulativeCost = item.lineTotalMinor * BigInt(cumulative) / BigInt(item.orderedQuantity);
    const receiptCost = cumulativeCost - alreadyCost;
    const receiptNumber = `${purchase.purchaseNumber}-R${String(purchase.receipts.length + 1).padStart(3, "0")}`;
    const receipt = await tx.purchaseReceipt.create({ data: {
      organizationId: t.organizationId, purchaseId: purchase.id, branchId: purchase.destinationBranchId,
      locationId: location.id, receiptNumber, receivedAt: input.receivedAt,
      receivedByUserId: a.userId, receivedByMembershipId: a.membershipId,
      idempotencyKey: input.idempotencyKey.trim(), note: clean(input.note),
    }}).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new PurchaseError("CONFLICT", "Ключ операции уже использован с другими данными.");
      throw error;
    });
    const line = await tx.purchaseReceiptLine.create({ data: {
      organizationId: t.organizationId, purchaseReceiptId: receipt.id, purchaseItemId: item.id,
      productVariantId: item.productVariantId, quantity: input.quantity,
      unitAcquisitionCostMinor: receiptCost / BigInt(input.quantity), totalAcquisitionCostMinor: receiptCost,
      currency: purchase.currency,
    }});
    if (item.productVariant.product.trackingMode === "SERIALIZED") {
      const counters = await tx.$queryRaw<Array<{ start_value: bigint }>>`INSERT INTO "inventory_counters" ("organization_id","next_value","updated_at") VALUES (${t.organizationId}::uuid,${BigInt(input.quantity) + BigInt(1)},CURRENT_TIMESTAMP) ON CONFLICT ("organization_id") DO UPDATE SET "next_value"="inventory_counters"."next_value"+${BigInt(input.quantity)},"updated_at"=CURRENT_TIMESTAMP RETURNING "next_value"-${BigInt(input.quantity)} AS "start_value"`;
      const base = receiptCost / BigInt(input.quantity), remainder = Number(receiptCost % BigInt(input.quantity));
      for (let n = 0; n < input.quantity; n++) {
        const serial = counters[0]!.start_value + BigInt(n), cost = base + (n < remainder ? BigInt(1) : BigInt(0));
        const instance = await tx.productInstance.create({ data: {
          organizationId: t.organizationId, productVariantId: item.productVariantId,
          inventoryNumber: `INV-${serial.toString().padStart(6, "0")}`, barcode: `MI${serial.toString().padStart(10, "0")}`,
          homeBranchId: purchase.destinationBranchId, currentBranchId: purchase.destinationBranchId, currentLocationId: location.id,
          acquiredAt: input.receivedAt, purchaseCostMinor: cost, currency: purchase.currency,
          purchaseItemId: item.id, purchaseReceiptLineId: line.id,
        }});
        await movement(tx, { organizationId: t.organizationId, productVariantId: item.productVariantId, productInstanceId: instance.id, type: "RECEIPT", quantity: 1, toBranchId: purchase.destinationBranchId, toLocationId: location.id, sourceType: "PURCHASE_RECEIPT_LINE", sourceId: line.id, idempotencyKey: `${input.idempotencyKey.trim()}:instance:${n}`, reason: clean(input.note), createdByUserId: a.userId });
      }
    } else {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${t.organizationId + ":stock:" + purchase.destinationBranchId + ":" + item.productVariantId},0))`;
      const level = await tx.stockLevel.findFirst({ where: { organizationId: t.organizationId, productVariantId: item.productVariantId, branchId: purchase.destinationBranchId, locationId: location.id } });
      if (level) await tx.stockLevel.update({ where: { id: level.id }, data: { quantity: { increment: input.quantity } } });
      else await tx.stockLevel.create({ data: { organizationId: t.organizationId, productVariantId: item.productVariantId, branchId: purchase.destinationBranchId, locationId: location.id, quantity: input.quantity } });
      await tx.bulkAcquisitionLayer.create({ data: { organizationId: t.organizationId, purchaseReceiptLineId: line.id, productVariantId: item.productVariantId, originalQuantity: input.quantity, unitCostMinor: receiptCost / BigInt(input.quantity), totalCostMinor: receiptCost, currency: purchase.currency, acquiredAt: input.receivedAt } });
      await movement(tx, { organizationId: t.organizationId, productVariantId: item.productVariantId, type: "RECEIPT", quantity: input.quantity, toBranchId: purchase.destinationBranchId, toLocationId: location.id, sourceType: "PURCHASE_RECEIPT_LINE", sourceId: line.id, idempotencyKey: `${input.idempotencyKey.trim()}:bulk`, reason: clean(input.note), createdByUserId: a.userId });
    }
    const all = await tx.purchaseItem.findMany({ where: { purchaseId: purchase.id }, include: { receiptLines: { select: { quantity: true } } } });
    const complete = all.every((row) => row.receiptLines.reduce((sum, x) => sum + x.quantity, 0) === row.orderedQuantity);
    const status = complete ? "RECEIVED" : "PARTIALLY_RECEIVED";
    await tx.purchase.update({ where: { id: purchase.id }, data: { status, version: { increment: 1 } } });
    await appendAuditLog(tx, { organizationId: t.organizationId, branchId: purchase.destinationBranchId, actorUserId: a.userId, actorMembershipId: a.membershipId, action: "PURCHASE_RECEIPT_CREATED", entityType: "PurchaseReceipt", entityId: receipt.id, correlationId: input.idempotencyKey, metadata: { purchaseId: purchase.id, purchaseNumber: purchase.purchaseNumber, purchaseItemId: item.id, receiptId: receipt.id, receiptNumber, quantity: input.quantity, status, trackingMode: item.productVariant.product.trackingMode, totalMinor: receiptCost.toString(), currency: purchase.currency } });
    return tx.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id }, include: { lines: { include: { instances: true, bulkLayer: true } } } });
  }, { maxWait: 10000, timeout: 30000 });
}

export async function closePartiallyReceivedPurchase(t: TenantContext, purchaseId: string, reason: string, idempotencyKey: string, a: Actor) {
  await requirePermission(pc(t, a), "PURCHASE_EDIT");
  const cleanReason = clean(reason), key = idempotencyKey.trim();
  if (!cleanReason) throw new PurchaseError("INVALID", "Укажите причину завершения поставки.");
  if (cleanReason.length > 1000 || !key) throw new PurchaseError("INVALID", "Проверьте данные операции.");
  return db.$transaction(async (tx) => {
    await lockPurchase(tx, t.organizationId, purchaseId);
    const p = await tx.purchase.findFirst({ where: { id: purchaseId, organizationId: t.organizationId } });
    if (!p) throw new PurchaseError("NOT_FOUND", "Закупка не найдена.");
    await requireUserBranchAccess(tx, t, a.userId, p.destinationBranchId);
    if (p.status === "CLOSED" && p.closeIdempotencyKey === key && p.closeReason === cleanReason) return p;
    if (p.status === "CLOSED" || p.closeIdempotencyKey === key) throw new PurchaseError("CONFLICT", "Ключ операции уже использован с другими данными.");
    if (p.status !== "PARTIALLY_RECEIVED") throw new PurchaseError("INVALID_STATE", "Завершить можно только частично полученную закупку.");
    const row = await tx.purchase.update({ where: { id: p.id }, data: { status: "CLOSED", closedAt: new Date(), closedByUserId: a.userId, closeReason: cleanReason, closeIdempotencyKey: key, version: { increment: 1 } } });
    await appendAuditLog(tx, { organizationId: t.organizationId, branchId: p.destinationBranchId, actorUserId: a.userId, actorMembershipId: a.membershipId, action: "PURCHASE_CLOSED", entityType: "Purchase", entityId: p.id, correlationId: key, metadata: { purchaseId: p.id, purchaseNumber: p.purchaseNumber, reason: cleanReason, status: "CLOSED" } });
    return row;
  });
}
