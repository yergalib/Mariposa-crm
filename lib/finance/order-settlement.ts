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

export type ReturnSettlementFacts = {
  orderStatus: string;
  issuedQuantity: number;
  returnedQuantity: number;
  unresolvedDamageCount: number;
  outstandingMinor: bigint;
  heldDepositMinor: bigint;
  damageChargeMinor: bigint;
  damageWithheldMinor: bigint;
  activeDamageChargeCount: number;
};

export function evaluateReturnSettlement(facts: ReturnSettlementFacts) {
  const physicalComplete = facts.issuedQuantity > 0 && facts.returnedQuantity >= facts.issuedQuantity;
  const refundPhysicalEligible = facts.orderStatus === "CONFIRMED" && (facts.issuedQuantity === 0 || facts.issuedQuantity === facts.returnedQuantity)
    || facts.orderStatus === "COMPLETED" && physicalComplete;
  const damageUnsettledMinor = facts.damageChargeMinor > facts.damageWithheldMinor ? facts.damageChargeMinor - facts.damageWithheldMinor : BigInt(0);
  const actions: ReturnSettlementAction[] = [];
  if (!physicalComplete) actions.push("COMPLETE_RETURN");
  if (facts.unresolvedDamageCount) actions.push("REVIEW_DAMAGE");
  if (facts.outstandingMinor > BigInt(0)) {
    if (facts.heldDepositMinor > BigInt(0) && damageUnsettledMinor > BigInt(0)) actions.push("WITHHOLD_DAMAGE");
    actions.push("RECEIVE_PAYMENT");
  }
  const canRefundDeposit = refundPhysicalEligible && facts.unresolvedDamageCount === 0 && facts.heldDepositMinor > BigInt(0)
    && !(facts.activeDamageChargeCount > 0 && facts.outstandingMinor > BigInt(0));
  if (canRefundDeposit) actions.push("REFUND_DEPOSIT");
  const state: ReturnSettlementState = !physicalComplete ? "RETURN_INCOMPLETE" : facts.unresolvedDamageCount ? "DAMAGE_DECISION_REQUIRED" : facts.outstandingMinor > BigInt(0) ? "DEBT_OUTSTANDING" : facts.heldDepositMinor > BigInt(0) ? "DEPOSIT_REFUND_REQUIRED" : "SETTLED";
  return { state, actions, physicalComplete, refundPhysicalEligible, canRefundDeposit, damageUnsettledMinor };
}

type SettlementReadClient = Pick<Prisma.TransactionClient, "capacityAllocation" | "financialTransaction" | "auditLog">;

export async function getUnresolvedDamageAllocationIds(tx: SettlementReadClient, organizationId: string, orderId: string) {
  const damaged = await tx.capacityAllocation.findMany({
    where: { organizationId, orderId, sourceType: "ORDER", returnedAt: { not: null }, returnInspectionResult: "DAMAGED", productInstanceId: { not: null } },
    select: { id: true },
  });
  if (!damaged.length) return [];
  const ids = damaged.map(row => row.id);
  const charges = await tx.financialTransaction.findMany({ where: { organizationId, kind: "DAMAGE_CHARGE", sourceType: "RETURN_DAMAGE_ASSESSMENT", sourceId: { in: ids }, reversal: null }, select: { sourceId: true } });
  const waivers = await tx.auditLog.findMany({ where: { organizationId, action: "ORDER_DAMAGE_WAIVED", entityType: "CapacityAllocation", entityId: { in: ids } }, select: { entityId: true } });
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
  const physical = await db.capacityAllocation.aggregate({ where: { organizationId: tenant.organizationId, orderId, sourceType: "ORDER", issuedAt: { not: null } }, _sum: { issuedQuantity: true, returnedQuantity: true } });
  const unresolvedIds = await getUnresolvedDamageAllocationIds(db, tenant.organizationId, orderId);
  const financial = await db.financialTransaction.aggregate({ where: { organizationId: tenant.organizationId, orderId, currency: order.currency }, _sum: { obligationEffectMinor: true, depositEffectMinor: true } });
  const damageRevenue = await db.financialTransaction.aggregate({ where: { organizationId: tenant.organizationId, orderId, currency: order.currency, OR: [{ kind: "DAMAGE_CHARGE" }, { kind: "REVERSAL", reversalOf: { kind: "DAMAGE_CHARGE" } }] }, _sum: { revenueEffectMinor: true } });
  const withheld = await db.financialTransaction.aggregate({ where: { organizationId: tenant.organizationId, orderId, currency: order.currency, OR: [{ kind: "DEPOSIT_WITHHELD" }, { kind: "REVERSAL", reversalOf: { kind: "DEPOSIT_WITHHELD" } }] }, _sum: { obligationEffectMinor: true } });
  const activeDamageChargeCount = await db.financialTransaction.count({ where: { organizationId: tenant.organizationId, orderId, kind: "DAMAGE_CHARGE", reversal: null } });
  const issuedQuantity = physical._sum.issuedQuantity ?? 0;
  const returnedQuantity = physical._sum.returnedQuantity ?? 0;
  const outstandingMinor = financial._sum.obligationEffectMinor ?? BigInt(0);
  const heldDepositMinor = financial._sum.depositEffectMinor ?? BigInt(0);
  const damageChargeMinor = damageRevenue._sum.revenueEffectMinor ?? BigInt(0);
  const damageWithheldMinor = -(withheld._sum.obligationEffectMinor ?? BigInt(0));
  const evaluated = evaluateReturnSettlement({ orderStatus: order.status, issuedQuantity, returnedQuantity, unresolvedDamageCount: unresolvedIds.length, outstandingMinor, heldDepositMinor, damageChargeMinor, damageWithheldMinor, activeDamageChargeCount });
  return { ...evaluated, issuedQuantity, returnedQuantity, unresolvedDamageCount: unresolvedIds.length, outstandingMinor, heldDepositMinor, refundableDepositMinor: evaluated.canRefundDeposit ? heldDepositMinor : BigInt(0), damageChargeMinor, damageWithheldMinor, currency: order.currency, orderStatus: order.status };
}
