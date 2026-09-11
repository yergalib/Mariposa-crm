import "server-only";

import { createHash } from "node:crypto";
import type { FinancialTransaction, Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { appendAuditLog } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { effectsFor } from "@/lib/finance/effects";
import { FinanceError } from "@/lib/finance/errors";
import { lockOrderFinance } from "@/lib/finance/order-lock";
import { evaluateReturnSettlement, getUnresolvedDamageAllocationIds } from "@/lib/finance/order-settlement";
import { createFinancialTransactionWithClient } from "@/lib/finance/transactions";
import { requirePermission } from "@/lib/permissions/effective";
import { requireUserBranchAccess } from "@/lib/staff/branch-access";
import type { TenantContext } from "@/lib/tenant/context";

type Actor = Pick<AuthContext, "userId" | "membershipId" | "role">;
const DEPOSIT_KINDS = ["DEPOSIT_RECEIVED", "DEPOSIT_REFUNDED", "DEPOSIT_WITHHELD"] as const;

function validateAmount(amountMinor: bigint) {
  if (amountMinor <= BigInt(0)) throw new FinanceError("INVALID", "Сумма должна быть больше нуля.");
}

function validateKey(value: string) {
  const key = value.trim();
  if (!key || key.length > 150) throw new FinanceError("INVALID", "Некорректный ключ операции.");
  return key;
}

async function orderContext(tx: Prisma.TransactionClient, tenant: TenantContext, orderId: string) {
  const order = await tx.order.findFirst({
    where: { id: orderId, organizationId: tenant.organizationId },
    select: { id: true, branchId: true, customerId: true, currency: true, type: true, status: true, depositRequiredMinor: true },
  });
  if (!order) throw new FinanceError("NOT_FOUND", "Заказ не найден.");
  return order;
}

async function heldDeposit(tx: Prisma.TransactionClient, organizationId: string, orderId: string, currency: string) {
  const aggregate = await tx.financialTransaction.aggregate({
    where: { organizationId, orderId, currency },
    _sum: { depositEffectMinor: true },
  });
  return aggregate._sum.depositEffectMinor ?? BigInt(0);
}

export async function setOrderRequiredDeposit(
  tenant: TenantContext,
  orderId: string,
  amountMinor: bigint,
  actor: Actor,
) {
  if (amountMinor < BigInt(0)) throw new FinanceError("INVALID", "Требуемый залог не может быть отрицательным.");
  await requirePermission({ organizationId: tenant.organizationId, membershipId: actor.membershipId, role: actor.role }, "DEPOSIT_MANAGE");
  return db.$transaction(async (tx) => {
    await lockOrderFinance(tx, tenant.organizationId, orderId);
    const order = await orderContext(tx, tenant, orderId);
    await requireUserBranchAccess(tx, tenant, actor.userId, order.branchId);
    if (order.type !== "RENTAL" || !["DRAFT", "RESERVED", "CONFIRMED"].includes(order.status))
      throw new FinanceError("INVALID", "Требуемый залог можно изменить только в активном заказе аренды.");
    const issued = await tx.capacityAllocation.count({ where: { organizationId: tenant.organizationId, orderId, issuedAt: { not: null } } });
    if (issued) throw new FinanceError("INVALID", "Требуемый залог нельзя изменить после выдачи.");
    if (order.depositRequiredMinor === amountMinor) return order;
    const history = await tx.financialTransaction.count({
      where: {
        organizationId: tenant.organizationId,
        orderId,
        OR: [
          { kind: { in: [...DEPOSIT_KINDS] } },
          { kind: "REVERSAL", reversalOf: { kind: { in: [...DEPOSIT_KINDS] } } },
        ],
      },
    });
    if (history) throw new FinanceError("INVALID", "Требуемый залог нельзя изменить после первой операции с залогом.");
    const updated = await tx.order.update({ where: { id: order.id }, data: { depositRequiredMinor: amountMinor, version: { increment: 1 } } });
    await appendAuditLog(tx, {
      organizationId: tenant.organizationId,
      branchId: order.branchId,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
      action: "ORDER_REQUIRED_DEPOSIT_CHANGED",
      entityType: "Order",
      entityId: order.id,
      metadata: { kind: "REQUIRED_DEPOSIT", amountMinor: amountMinor.toString(), currency: order.currency, sourceType: "ORDER" },
    });
    return updated;
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function receiveOrderDeposit(
  tenant: TenantContext,
  input: { orderId: string; amountMinor: bigint; paymentMethodId: string; idempotencyKey: string },
  actor: Actor,
) {
  validateAmount(input.amountMinor);
  const idempotencyKey = validateKey(input.idempotencyKey);
  await requirePermission({ organizationId: tenant.organizationId, membershipId: actor.membershipId, role: actor.role }, "DEPOSIT_MANAGE");
  return db.$transaction(async (tx) => {
    await lockOrderFinance(tx, tenant.organizationId, input.orderId);
    const order = await orderContext(tx, tenant, input.orderId);
    await requireUserBranchAccess(tx, tenant, actor.userId, order.branchId);
    if (order.type !== "RENTAL" || order.status !== "CONFIRMED")
      throw new FinanceError("INVALID", "Залог можно принять только по подтверждённому заказу аренды.");
    const transactionInput = {
      branchId: order.branchId,
      customerId: order.customerId,
      orderId: order.id,
      amountMinor: input.amountMinor,
      currency: order.currency,
      paymentMethodId: input.paymentMethodId,
      sourceType: "ORDER_DEPOSIT_RECEIPT",
      sourceId: order.id,
      idempotencyKey,
      reason: undefined,
    };
    const replay = await tx.financialTransaction.findUnique({ where: { organizationId_idempotencyKey: { organizationId: tenant.organizationId, idempotencyKey } } });
    if (replay)
      return createFinancialTransactionWithClient(tx, tenant, "DEPOSIT_RECEIVED", transactionInput, actor, effectsFor("DEPOSIT_RECEIVED", input.amountMinor));
    const held = await heldDeposit(tx, tenant.organizationId, order.id, order.currency);
    const remaining = order.depositRequiredMinor - held;
    if (input.amountMinor > remaining)
      throw new FinanceError("INVALID", "Сумма залога превышает недостающую сумму по заказу.");
    return createFinancialTransactionWithClient(tx, tenant, "DEPOSIT_RECEIVED", transactionInput, actor, effectsFor("DEPOSIT_RECEIVED", input.amountMinor));
  }, { maxWait: 10_000, timeout: 30_000 });
}

function operationId(organizationId: string, idempotencyKey: string) {
  const hex = createHash("sha256").update(`${organizationId}:order-deposit-refund:${idempotencyKey}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function childKey(root: string, index: number) {
  if (index === 0) return root;
  return `deposit-refund-part:${createHash("sha256").update(`${root}:${index}`).digest("hex")}`;
}

export async function refundOrderDeposit(
  tenant: TenantContext,
  input: { orderId: string; amountMinor: bigint; reason: string; confirmed: boolean; idempotencyKey: string },
  actor: Actor,
) {
  validateAmount(input.amountMinor);
  const idempotencyKey = validateKey(input.idempotencyKey), reason = input.reason.trim();
  if (!input.confirmed || reason.length < 3 || reason.length > 500)
    throw new FinanceError("INVALID", "Подтвердите возврат и укажите причину.");
  await requirePermission({ organizationId: tenant.organizationId, membershipId: actor.membershipId, role: actor.role }, "DEPOSIT_REFUND");
  return db.$transaction(async (tx) => {
    await lockOrderFinance(tx, tenant.organizationId, input.orderId);
    const order = await orderContext(tx, tenant, input.orderId);
    await requireUserBranchAccess(tx, tenant, actor.userId, order.branchId);
    const opId = operationId(tenant.organizationId, idempotencyKey);
    const replayHead = await tx.financialTransaction.findUnique({ where: { organizationId_idempotencyKey: { organizationId: tenant.organizationId, idempotencyKey } } });
    if (replayHead) {
      const rows = await tx.financialTransaction.findMany({ where: { organizationId: tenant.organizationId, sourceType: "ORDER_DEPOSIT_REFUND", sourceId: opId }, orderBy: { createdAt: "asc" } });
      const total = rows.reduce((sum, row) => sum + row.amountMinor, BigInt(0));
      if (!rows.length || replayHead.kind !== "DEPOSIT_REFUNDED" || replayHead.branchId !== order.branchId || replayHead.customerId !== order.customerId || replayHead.orderId !== order.id || replayHead.currency !== order.currency || replayHead.reason !== reason || total !== input.amountMinor)
        throw new FinanceError("CONFLICT", "Ключ повторной операции уже использован с другими данными.");
      return rows;
    }
    const issued = await tx.capacityAllocation.aggregate({ where: { organizationId: tenant.organizationId, orderId: order.id, issuedAt: { not: null } }, _sum: { issuedQuantity: true, returnedQuantity: true } });
    const issuedQuantity = issued._sum.issuedQuantity ?? 0, returnedQuantity = issued._sum.returnedQuantity ?? 0;
    const unresolvedDamage = await getUnresolvedDamageAllocationIds(tx, tenant.organizationId, order.id);
    const held = await heldDeposit(tx, tenant.organizationId, order.id, order.currency);
    const damageCharges = await tx.financialTransaction.count({ where: { organizationId: tenant.organizationId, orderId: order.id, kind: "DAMAGE_CHARGE", reversal: null } });
    const obligation = await tx.financialTransaction.aggregate({ where: { organizationId: tenant.organizationId, orderId: order.id, currency: order.currency }, _sum: { obligationEffectMinor: true } });
    const eligibility = evaluateReturnSettlement({ orderStatus: order.status, issuedQuantity, returnedQuantity, unresolvedDamageCount: unresolvedDamage.length, outstandingMinor: obligation._sum.obligationEffectMinor ?? BigInt(0), heldDepositMinor: held, damageChargeMinor: BigInt(0), damageWithheldMinor: BigInt(0), activeDamageChargeCount: damageCharges });
    if (!eligibility.refundPhysicalEligible) throw new FinanceError("INVALID", "Залог можно вернуть до выдачи либо после полного возврата товаров.");
    if (unresolvedDamage.length) throw new FinanceError("INVALID", "Сначала примите решение по всем обнаруженным повреждениям.");
    if (damageCharges > 0 && (obligation._sum.obligationEffectMinor ?? BigInt(0)) > BigInt(0))
      throw new FinanceError("INVALID", "Сначала погасите начисленный ущерб или удержите его из залога.");
    if (input.amountMinor > held) throw new FinanceError("INVALID", "Сумма возврата превышает удерживаемый залог.");
    const receipts = await tx.financialTransaction.findMany({
      where: { organizationId: tenant.organizationId, orderId: order.id, currency: order.currency, kind: "DEPOSIT_RECEIVED", reversal: null },
      include: { relatedTransactions: { select: { depositEffectMinor: true } } },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    let remaining = input.amountMinor;
    const rows: FinancialTransaction[] = [];
    for (const receipt of receipts) {
      const available = receipt.depositEffectMinor + receipt.relatedTransactions.reduce((sum, row) => sum + row.depositEffectMinor, BigInt(0));
      const amountMinor = available > remaining ? remaining : available;
      if (amountMinor <= BigInt(0)) continue;
      const index = rows.length;
      rows.push(await createFinancialTransactionWithClient(tx, tenant, "DEPOSIT_REFUNDED", {
        branchId: order.branchId,
        customerId: order.customerId,
        orderId: order.id,
        amountMinor,
        currency: order.currency,
        paymentMethodId: receipt.paymentMethodId ?? undefined,
        sourceType: "ORDER_DEPOSIT_REFUND",
        sourceId: opId,
        idempotencyKey: childKey(idempotencyKey, index),
        reason,
      }, actor, effectsFor("DEPOSIT_REFUNDED", amountMinor), receipt.id, undefined, true));
      remaining -= amountMinor;
      if (remaining === BigInt(0)) break;
    }
    if (remaining !== BigInt(0)) throw new FinanceError("CONFLICT", "Не удалось распределить возврат по поступлениям залога.");
    await appendAuditLog(tx, {
      organizationId: tenant.organizationId,
      branchId: order.branchId,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
      action: "ORDER_DEPOSIT_REFUNDED",
      entityType: "Order",
      entityId: order.id,
      metadata: { kind: "DEPOSIT_REFUNDED", amountMinor: input.amountMinor.toString(), currency: order.currency, sourceType: "ORDER_DEPOSIT_REFUND" },
    });
    return rows;
  }, { maxWait: 10_000, timeout: 30_000 });
}
