import "server-only";

import { createHash } from "node:crypto";
import type { FinancialTransaction, Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { appendAuditLog } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { effectsFor } from "@/lib/finance/effects";
import { FinanceError } from "@/lib/finance/errors";
import { lockOrderFinance } from "@/lib/finance/order-lock";
import { createFinancialTransactionWithClient } from "@/lib/finance/transactions";
import { requirePermission } from "@/lib/permissions/effective";
import { requireUserBranchAccess } from "@/lib/staff/branch-access";
import type { TenantContext } from "@/lib/tenant/context";

type Actor = Pick<AuthContext, "userId" | "membershipId" | "role">;
const SOURCE_ASSESSMENT = "RETURN_DAMAGE_ASSESSMENT";
const SOURCE_SETTLEMENT = "DAMAGE_DEPOSIT_SETTLEMENT";

function cleanReason(value: string) {
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 500) throw new FinanceError("INVALID", "Укажите причину решения по ущербу.");
  return reason;
}
function cleanKey(value: string) {
  const key = value.trim();
  if (!key || key.length > 150) throw new FinanceError("INVALID", "Некорректный ключ операции.");
  return key;
}
function childKey(root: string, index: number) {
  return index === 0 ? root : `damage-withhold-part:${createHash("sha256").update(`${root}:${index}`).digest("hex")}`;
}
function waiverCorrelation(organizationId: string, key: string) {
  return `damage-waiver:${createHash("sha256").update(`${organizationId}:${key}`).digest("hex")}`;
}

async function damagedAllocation(tx: Prisma.TransactionClient, tenant: TenantContext, allocationId: string) {
  const allocation = await tx.capacityAllocation.findFirst({
    where: { id: allocationId, organizationId: tenant.organizationId, sourceType: "ORDER", returnedAt: { not: null }, returnInspectionResult: "DAMAGED", productInstanceId: { not: null }, orderId: { not: null } },
    select: { id: true, branchId: true, orderId: true, productInstanceId: true, order: { select: { customerId: true, currency: true, status: true } } },
  });
  if (!allocation?.orderId || !allocation.order || !allocation.productInstanceId) throw new FinanceError("NOT_FOUND", "Повреждённый возврат недоступен.");
  return { ...allocation, orderId: allocation.orderId, productInstanceId: allocation.productInstanceId, customerId: allocation.order.customerId, currency: allocation.order.currency };
}

async function activeCharge(tx: Prisma.TransactionClient, organizationId: string, allocationId: string) {
  return tx.financialTransaction.findFirst({ where: { organizationId, kind: "DAMAGE_CHARGE", sourceType: SOURCE_ASSESSMENT, sourceId: allocationId, reversal: null }, orderBy: { createdAt: "asc" } });
}

export async function assessOrderDamage(tenant: TenantContext, input: { allocationId: string; amountMinor: bigint; reason: string; idempotencyKey: string }, actor: Actor) {
  if (input.amountMinor <= BigInt(0)) throw new FinanceError("INVALID", "Сумма ущерба должна быть больше нуля.");
  const reason = cleanReason(input.reason), idempotencyKey = cleanKey(input.idempotencyKey);
  await requirePermission({ organizationId: tenant.organizationId, membershipId: actor.membershipId, role: actor.role }, "DAMAGE_ASSESS");
  const initial = await db.capacityAllocation.findFirst({ where: { id: input.allocationId, organizationId: tenant.organizationId }, select: { orderId: true } });
  if (!initial?.orderId) throw new FinanceError("NOT_FOUND", "Повреждённый возврат недоступен.");
  return db.$transaction(async tx => {
    await lockOrderFinance(tx, tenant.organizationId, initial.orderId!);
    const allocation = await damagedAllocation(tx, tenant, input.allocationId);
    await requireUserBranchAccess(tx, tenant, actor.userId, allocation.branchId);
    const transactionInput = { branchId: allocation.branchId, customerId: allocation.customerId, orderId: allocation.orderId, amountMinor: input.amountMinor, currency: allocation.currency, sourceType: SOURCE_ASSESSMENT, sourceId: allocation.id, idempotencyKey, reason };
    const replay = await tx.financialTransaction.findUnique({ where: { organizationId_idempotencyKey: { organizationId: tenant.organizationId, idempotencyKey } } });
    if (replay) return createFinancialTransactionWithClient(tx, tenant, "DAMAGE_CHARGE", transactionInput, actor, effectsFor("DAMAGE_CHARGE", input.amountMinor));
    if (await activeCharge(tx, tenant.organizationId, allocation.id)) throw new FinanceError("CONFLICT", "Ущерб по этому возврату уже начислен.");
    const waived = await tx.auditLog.findFirst({ where: { organizationId: tenant.organizationId, action: "ORDER_DAMAGE_WAIVED", entityType: "CapacityAllocation", entityId: allocation.id } });
    if (waived) throw new FinanceError("CONFLICT", "По этому повреждению уже принято решение не начислять ущерб.");
    const row = await createFinancialTransactionWithClient(tx, tenant, "DAMAGE_CHARGE", transactionInput, actor, effectsFor("DAMAGE_CHARGE", input.amountMinor));
    await appendAuditLog(tx, { organizationId: tenant.organizationId, branchId: allocation.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "ORDER_DAMAGE_CHARGED", entityType: "CapacityAllocation", entityId: allocation.id, correlationId: idempotencyKey, metadata: { kind: "DAMAGE_CHARGE", amountMinor: input.amountMinor.toString(), currency: allocation.currency, sourceType: SOURCE_ASSESSMENT, allocationId: allocation.id, productInstanceId: allocation.productInstanceId, reason } });
    return row;
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function waiveOrderDamage(tenant: TenantContext, input: { allocationId: string; reason: string; idempotencyKey: string }, actor: Actor) {
  const reason = cleanReason(input.reason), idempotencyKey = cleanKey(input.idempotencyKey), correlationId = waiverCorrelation(tenant.organizationId, idempotencyKey);
  await requirePermission({ organizationId: tenant.organizationId, membershipId: actor.membershipId, role: actor.role }, "DAMAGE_ASSESS");
  const initial = await db.capacityAllocation.findFirst({ where: { id: input.allocationId, organizationId: tenant.organizationId }, select: { orderId: true } });
  if (!initial?.orderId) throw new FinanceError("NOT_FOUND", "Повреждённый возврат недоступен.");
  return db.$transaction(async tx => {
    await lockOrderFinance(tx, tenant.organizationId, initial.orderId!);
    const allocation = await damagedAllocation(tx, tenant, input.allocationId);
    await requireUserBranchAccess(tx, tenant, actor.userId, allocation.branchId);
    const replay = await tx.auditLog.findFirst({ where: { organizationId: tenant.organizationId, action: "ORDER_DAMAGE_WAIVED", correlationId } });
    if (replay) {
      const metadata = replay.metadata as Record<string, unknown> | null;
      if (replay.entityId !== allocation.id || metadata?.reason !== reason) throw new FinanceError("CONFLICT", "Ключ повторной операции уже использован с другими данными.");
      return replay;
    }
    if (await activeCharge(tx, tenant.organizationId, allocation.id)) throw new FinanceError("CONFLICT", "Ущерб по этому возврату уже начислен.");
    if (await tx.auditLog.findFirst({ where: { organizationId: tenant.organizationId, action: "ORDER_DAMAGE_WAIVED", entityType: "CapacityAllocation", entityId: allocation.id } })) throw new FinanceError("CONFLICT", "Решение по этому повреждению уже принято.");
    return appendAuditLog(tx, { organizationId: tenant.organizationId, branchId: allocation.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "ORDER_DAMAGE_WAIVED", entityType: "CapacityAllocation", entityId: allocation.id, correlationId, metadata: { kind: "DAMAGE_WAIVED", currency: allocation.currency, sourceType: SOURCE_ASSESSMENT, allocationId: allocation.id, productInstanceId: allocation.productInstanceId, reason } });
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function withholdOrderDepositForDamage(tenant: TenantContext, input: { damageChargeId: string; amountMinor: bigint; reason: string; idempotencyKey: string }, actor: Actor) {
  if (input.amountMinor <= BigInt(0)) throw new FinanceError("INVALID", "Сумма удержания должна быть больше нуля.");
  const reason = cleanReason(input.reason), idempotencyKey = cleanKey(input.idempotencyKey);
  await requirePermission({ organizationId: tenant.organizationId, membershipId: actor.membershipId, role: actor.role }, "DEPOSIT_WITHHOLD");
  const initial = await db.financialTransaction.findFirst({ where: { id: input.damageChargeId, organizationId: tenant.organizationId, kind: "DAMAGE_CHARGE", sourceType: SOURCE_ASSESSMENT }, select: { orderId: true } });
  if (!initial?.orderId) throw new FinanceError("NOT_FOUND", "Начисление ущерба недоступно.");
  return db.$transaction(async tx => {
    await lockOrderFinance(tx, tenant.organizationId, initial.orderId!);
    const charge = await tx.financialTransaction.findFirst({ where: { id: input.damageChargeId, organizationId: tenant.organizationId, kind: "DAMAGE_CHARGE", sourceType: SOURCE_ASSESSMENT }, include: { reversal: { select: { id: true } } } });
    if (!charge?.orderId || !charge.customerId || charge.reversal) throw new FinanceError("NOT_FOUND", "Начисление ущерба недоступно.");
    await requireUserBranchAccess(tx, tenant, actor.userId, charge.branchId);
    const replayHead = await tx.financialTransaction.findUnique({ where: { organizationId_idempotencyKey: { organizationId: tenant.organizationId, idempotencyKey } } });
    if (replayHead) {
      const rows: FinancialTransaction[] = [];
      for (let index = 0; index < 100; index += 1) {
        const row = await tx.financialTransaction.findUnique({ where: { organizationId_idempotencyKey: { organizationId: tenant.organizationId, idempotencyKey: childKey(idempotencyKey, index) } } });
        if (!row) break;
        rows.push(row);
      }
      const total = rows.reduce((sum, row) => sum + row.amountMinor, BigInt(0));
      if (!rows.length || rows.some(row => row.kind !== "DEPOSIT_WITHHELD" || row.sourceType !== SOURCE_SETTLEMENT || row.sourceId !== charge.id) || replayHead.branchId !== charge.branchId || replayHead.customerId !== charge.customerId || replayHead.orderId !== charge.orderId || replayHead.currency !== charge.currency || replayHead.reason !== reason || total !== input.amountMinor) throw new FinanceError("CONFLICT", "Ключ повторной операции уже использован с другими данными.");
      return rows;
    }
    const [heldAggregate, orderObligation, priorSettlement] = await Promise.all([
      tx.financialTransaction.aggregate({ where: { organizationId: tenant.organizationId, orderId: charge.orderId, currency: charge.currency }, _sum: { depositEffectMinor: true } }),
      tx.financialTransaction.aggregate({ where: { organizationId: tenant.organizationId, orderId: charge.orderId, currency: charge.currency }, _sum: { obligationEffectMinor: true } }),
      tx.financialTransaction.aggregate({ where: { organizationId: tenant.organizationId, OR: [{ kind: "DEPOSIT_WITHHELD", sourceType: SOURCE_SETTLEMENT, sourceId: charge.id }, { kind: "REVERSAL", reversalOf: { is: { kind: "DEPOSIT_WITHHELD", sourceType: SOURCE_SETTLEMENT, sourceId: charge.id } } }] }, _sum: { obligationEffectMinor: true } }),
    ]);
    const held = heldAggregate._sum.depositEffectMinor ?? BigInt(0);
    const outstanding = orderObligation._sum.obligationEffectMinor ?? BigInt(0);
    const damageRemaining = charge.amountMinor + (priorSettlement._sum.obligationEffectMinor ?? BigInt(0));
    const allowed = held < outstanding ? (held < damageRemaining ? held : damageRemaining) : (outstanding < damageRemaining ? outstanding : damageRemaining);
    if (input.amountMinor > allowed) throw new FinanceError("INVALID", "Сумма удержания превышает доступный залог или непогашенный ущерб.");
    const receipts = await tx.financialTransaction.findMany({ where: { organizationId: tenant.organizationId, orderId: charge.orderId, currency: charge.currency, kind: "DEPOSIT_RECEIVED", reversal: null }, include: { relatedTransactions: { select: { depositEffectMinor: true } } }, orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
    let remaining = input.amountMinor;
    const rows: FinancialTransaction[] = [];
    for (const receipt of receipts) {
      const available = receipt.depositEffectMinor + receipt.relatedTransactions.reduce((sum, row) => sum + row.depositEffectMinor, BigInt(0));
      const amountMinor = available > remaining ? remaining : available;
      if (amountMinor <= BigInt(0)) continue;
      rows.push(await createFinancialTransactionWithClient(tx, tenant, "DEPOSIT_WITHHELD", { branchId: charge.branchId, customerId: charge.customerId, orderId: charge.orderId, amountMinor, currency: charge.currency, sourceType: SOURCE_SETTLEMENT, sourceId: charge.id, idempotencyKey: childKey(idempotencyKey, rows.length), reason }, actor, effectsFor("DEPOSIT_WITHHELD", amountMinor), receipt.id));
      remaining -= amountMinor;
      if (remaining === BigInt(0)) break;
    }
    if (remaining !== BigInt(0)) throw new FinanceError("CONFLICT", "Не удалось распределить удержание по поступлениям залога.");
    await appendAuditLog(tx, { organizationId: tenant.organizationId, branchId: charge.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "ORDER_DAMAGE_DEPOSIT_WITHHELD", entityType: "FinancialTransaction", entityId: charge.id, correlationId: idempotencyKey, metadata: { kind: "DEPOSIT_WITHHELD", amountMinor: input.amountMinor.toString(), currency: charge.currency, sourceType: SOURCE_SETTLEMENT, relatedTransactionId: charge.id, reason } });
    return rows;
  }, { maxWait: 10_000, timeout: 30_000 });
}
