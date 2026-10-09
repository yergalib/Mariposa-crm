import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { createTenantContext } from "@/lib/tenant/context";
import { accessibleBranchIds } from "@/lib/staff/branch-access";
import { financeReadVisibility } from "./read-visibility";
import { reverseFinancialTransaction } from "./transactions";
import { FinanceError } from "./errors";

const reversalInput = z.object({
  transactionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  confirmed: z.literal("yes"),
});

export async function getReversalTarget(session: AuthContext, id: string) {
  await requirePermission(session, "PAYMENT_REVERSE");
  if (!z.string().uuid().safeParse(id).success) return null;
  const [visibility, branchIds] = await Promise.all([
    financeReadVisibility(session),
    accessibleBranchIds(createTenantContext(session.organizationId), session.membershipId),
  ]);
  if (!visibility.hasRows || branchIds?.length === 0) return null;
  return db.financialTransaction.findFirst({
    where: { AND: [
      { id, organizationId: session.organizationId, kind: { notIn: ["REVERSAL","CASH_EXPENSE","CASH_TRANSFER_OUT","CASH_TRANSFER_IN","CASH_OPENING"] },
        branchId: branchIds === null ? undefined : { in: branchIds } },
      visibility.where,
    ] },
    select: { id: true, kind: true, amountMinor: true, currency: true, branchId: true,
      customerId: true, orderId: true, occurredAt: true, reversal: { select: { id: true } },
      branch: { select: { name: true, timezone: true } },
      order: { select: { id: true, orderNumber: true, status: true } } },
  });
}

export async function reverseVisibleFinancialTransaction(session: AuthContext, raw: unknown) {
  const parsed = reversalInput.safeParse(raw);
  if (!parsed.success) throw new FinanceError("INVALID", "Укажите причину от 3 до 500 символов и подтвердите исправление.");
  const input = parsed.data;
  const original = await getReversalTarget(session, input.transactionId);
  if (!original) throw new FinanceError("NOT_FOUND", "Финансовая операция недоступна.");
  // The existing service enforces immutable history, dependent effects, locks and replay.
  // Never trust branch/customer/order or an amount supplied by the form.
  return reverseFinancialTransaction(createTenantContext(session.organizationId), original.id, {
    branchId: original.branchId, customerId: original.customerId ?? undefined,
    orderId: original.orderId ?? undefined, reason: input.reason,
    idempotencyKey: `crm-reversal:${input.idempotencyKey}`,
    sourceType: "CRM_MANUAL_REVERSAL", sourceId: original.id,
  }, { userId: session.userId, membershipId: session.membershipId, role: session.role });
}
