import "server-only";
import type { FinancialTransactionKind, Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";

export async function financeReadVisibility(actor: AuthContext) {
  const [payments, deposits, revenue, obligation] = await Promise.all([
    hasPermission(actor, "PAYMENT_VIEW"), hasPermission(actor, "DEPOSIT_VIEW"),
    hasPermission(actor, "FINANCE_MARGIN_VIEW"), hasPermission(actor, "CUSTOMER_BALANCE_VIEW")
  ]);
  const kinds: FinancialTransactionKind[] = [
    ...(payments ? ["PAYMENT_RECEIVED", "CUSTOMER_REFUND"] as const : []),
    ...(deposits ? ["DEPOSIT_RECEIVED", "DEPOSIT_REFUNDED", "DEPOSIT_WITHHELD"] as const : []),
    ...(revenue ? ["RENTAL_CHARGE", "SALE_CHARGE", "DAMAGE_CHARGE", "DISCOUNT"] as const : [])
  ];
  const where: Prisma.FinancialTransactionWhereInput = { OR: [
    { kind: { in: kinds } },
    { kind: "REVERSAL", reversalOf: { is: { organizationId: actor.organizationId, kind: { in: kinds } } } }
  ] };
  const fields = {
    ...(revenue ? { revenueEffectMinor: true as const } : {}),
    ...(payments || deposits ? { cashEffectMinor: true as const } : {}),
    ...(deposits ? { depositEffectMinor: true as const } : {}),
    ...(obligation ? { obligationEffectMinor: true as const } : {})
  };
  return { payments, deposits, revenue, obligation, fields, where, hasRows: kinds.length > 0 };
}

// Omit denied keys, even if a query adapter returns more fields than requested.
export function visibleFinanceEffects(row: { revenueEffectMinor?: bigint | null; cashEffectMinor?: bigint | null;
  depositEffectMinor?: bigint | null; obligationEffectMinor?: bigint | null }, visibility: Awaited<ReturnType<typeof financeReadVisibility>>) {
  return {
    ...(visibility.revenue ? { revenueEffectMinor: row.revenueEffectMinor ?? BigInt(0) } : {}),
    ...(visibility.fields.cashEffectMinor ? { cashEffectMinor: row.cashEffectMinor ?? BigInt(0) } : {}),
    ...(visibility.deposits ? { depositEffectMinor: row.depositEffectMinor ?? BigInt(0) } : {}),
    ...(visibility.obligation ? { obligationEffectMinor: row.obligationEffectMinor ?? BigInt(0) } : {})
  };
}
