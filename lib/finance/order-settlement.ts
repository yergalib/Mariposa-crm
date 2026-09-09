import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { FinanceError } from "@/lib/finance/errors";
import { requirePermission } from "@/lib/permissions/effective";
import { requireBranchAccess } from "@/lib/staff/branch-access";
import type { TenantContext } from "@/lib/tenant/context";

type Actor = Pick<AuthContext, "membershipId" | "role">;
export type ReturnSettlementState = "RETURN_INCOMPLETE" | "DAMAGE_DECISION_REQUIRED" | "DEBT_OUTSTANDING" | "DEPOSIT_REFUND_REQUIRED" | "SETTLED";
export type ReturnSettlementAction = "COMPLETE_RETURN" | "REVIEW_DAMAGE" | "WITHHOLD_DAMAGE" | "RECEIVE_PAYMENT" | "REFUND_DEPOSIT";

export async function getUnresolvedDamageAllocationIds(tx: Prisma.TransactionClient, organizationId: string, orderId: string) {
  const damaged = await tx.capacityAllocation.findMany({
    where: { organizationId, orderId, sourceType: "ORDER", returnedAt: { not: null }, returnInspectionResult: "DAMAGED", productInstanceId: { not: null } },
    select: { id: true },
  });
  if (!damaged.length) return [];
  const ids = damaged.map(row => row.id);
  const [charges, waivers] = await Promise.all([
    tx.financialTransaction.findMany({ where: { organizationId, kind: "DAMAGE_CHARGE", sourceType: "RETURN_DAMAGE_ASSESSMENT", sourceId: { in: ids }, reversal: null }, select: { sourceId: true } }),
    tx.auditLog.findMany({ where: { organizationId, action: "ORDER_DAMAGE_WAIVED", entityType: "CapacityAllocation", entityId: { in: ids } }, select: { entityId: true } }),
  ]);
  const resolved = new Set([...charges.map(row => row.sourceId), ...waivers.map(row => row.entityId)]);
  return ids.filter(id => !resolved.has(id));
}

export async function getOrderReturnSettlement(tenant: TenantContext, orderId: string, actor: Actor) {
  const permissionContext = { organizationId: tenant.organizationId, ...actor };
  await requirePermission(permissionContext, "PAYMENT_VIEW");
  await requirePermission(permissionContext, "DEPOSIT_VIEW");
  const order = await db.order.findFirst({ where: { id: orderId, organizationId: tenant.organizationId }, select: { id: true, branchId: true, currency: true, status: true } });
  if (!order) throw new FinanceError("NOT_FOUND", "Заказ не найден.");
  await requireBranchAccess(tenant, actor.membershipId, order.branchId);
  const [physical, unresolvedIds, financial, damageRevenue, withheld] = await Promise.all([
    db.capacityAllocation.aggregate({ where: { organizationId: tenant.organizationId, orderId, sourceType: "ORDER", issuedAt: { not: null } }, _sum: { issuedQuantity: true, returnedQuantity: true } }),
    db.$transaction(tx => getUnresolvedDamageAllocationIds(tx, tenant.organizationId, orderId)),
    db.financialTransaction.aggregate({ where: { organizationId: tenant.organizationId, orderId, currency: order.currency }, _sum: { obligationEffectMinor: true, depositEffectMinor: true } }),
    db.financialTransaction.aggregate({ where: { organizationId: tenant.organizationId, orderId, currency: order.currency, OR: [{ kind: "DAMAGE_CHARGE" }, { kind: "REVERSAL", reversalOf: { kind: "DAMAGE_CHARGE" } }] }, _sum: { revenueEffectMinor: true } }),
    db.financialTransaction.aggregate({ where: { organizationId: tenant.organizationId, orderId, currency: order.currency, OR: [{ kind: "DEPOSIT_WITHHELD" }, { kind: "REVERSAL", reversalOf: { kind: "DEPOSIT_WITHHELD" } }] }, _sum: { obligationEffectMinor: true } }),
  ]);
  const issuedQuantity = physical._sum.issuedQuantity ?? 0;
  const returnedQuantity = physical._sum.returnedQuantity ?? 0;
  const physicalComplete = issuedQuantity > 0 && returnedQuantity >= issuedQuantity;
  const outstandingMinor = financial._sum.obligationEffectMinor ?? BigInt(0);
  const heldDepositMinor = financial._sum.depositEffectMinor ?? BigInt(0);
  const damageChargeMinor = damageRevenue._sum.revenueEffectMinor ?? BigInt(0);
  const damageWithheldMinor = -(withheld._sum.obligationEffectMinor ?? BigInt(0));
  const damageUnsettledMinor = damageChargeMinor > damageWithheldMinor ? damageChargeMinor - damageWithheldMinor : BigInt(0);
  const actions: ReturnSettlementAction[] = [];
  if (!physicalComplete) actions.push("COMPLETE_RETURN");
  if (unresolvedIds.length) actions.push("REVIEW_DAMAGE");
  if (outstandingMinor > BigInt(0)) {
    if (heldDepositMinor > BigInt(0) && damageUnsettledMinor > BigInt(0)) actions.push("WITHHOLD_DAMAGE");
    actions.push("RECEIVE_PAYMENT");
  }
  const canRefundDeposit = physicalComplete && unresolvedIds.length === 0 && heldDepositMinor > BigInt(0) && !(damageChargeMinor > BigInt(0) && outstandingMinor > BigInt(0));
  if (canRefundDeposit) actions.push("REFUND_DEPOSIT");
  const state: ReturnSettlementState = !physicalComplete ? "RETURN_INCOMPLETE" : unresolvedIds.length ? "DAMAGE_DECISION_REQUIRED" : outstandingMinor > BigInt(0) ? "DEBT_OUTSTANDING" : heldDepositMinor > BigInt(0) ? "DEPOSIT_REFUND_REQUIRED" : "SETTLED";
  return { state, actions, physicalComplete, issuedQuantity, returnedQuantity, unresolvedDamageCount: unresolvedIds.length, outstandingMinor, heldDepositMinor, refundableDepositMinor: canRefundDeposit ? heldDepositMinor : BigInt(0), damageChargeMinor, damageWithheldMinor, currency: order.currency, orderStatus: order.status, canRefundDeposit };
}
