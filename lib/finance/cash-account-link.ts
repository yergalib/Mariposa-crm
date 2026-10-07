import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { FinanceError } from "./errors";

// Preflight for a readable error. The insert trigger is authoritative and binds
// the new journal row once; it never updates historical financial records.
export async function assertCashAccountReady(tx: Prisma.TransactionClient, organizationId: string, branchId: string, currency: string, paymentMethodId?: string | null) {
  if (!await tx.cashAccount.count({ where: { organizationId, branchId } })) return;
  const method = paymentMethodId ? await tx.paymentMethod.findFirst({ where: { id: paymentMethodId, organizationId }, select: { cashAccountKind: true } }) : null;
  if (!method?.cashAccountKind) throw new FinanceError("INVALID", "Для способа оплаты не выбран наличный или безналичный счёт. Обратитесь к сотруднику с правом настройки способов оплаты.");
  const account = await tx.cashAccount.findFirst({ where: { organizationId, branchId, kind: method.cashAccountKind, currency }, select: { id: true } });
  if (!account || !await tx.financialTransaction.findFirst({ where: { organizationId, cashAccountId: account.id, kind: "CASH_OPENING", reversal: null }, select: { id: true } })) throw new FinanceError("INVALID", "Сначала задайте начальный остаток соответствующей кассы филиала. Учётные кассы доступны только в KZT.");
}
