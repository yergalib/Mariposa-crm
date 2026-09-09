import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import type { AuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { requireUserBranchAccess } from "@/lib/staff/branch-access";
import { appendAuditLog } from "@/lib/audit/log";
import { effectsFor } from "@/lib/finance/effects";
import { FinanceError } from "@/lib/finance/errors";
import { lockOrderFinance } from "@/lib/finance/order-lock";
import { createFinancialTransactionWithClient, refundPayment } from "@/lib/finance/transactions";

type Actor = Pick<AuthContext, "userId" | "membershipId" | "role">;
type ChargeActor = { userId?: string; membershipId?: string };

async function orderForFinance(tx: Prisma.TransactionClient, tenant: TenantContext, orderId: string) {
  const order = await tx.order.findFirst({
    where: { id: orderId, organizationId: tenant.organizationId },
    select: { id: true, branchId: true, customerId: true, currency: true, totalMinor: true, status: true, type: true },
  });
  if (!order) throw new FinanceError("NOT_FOUND", "Заказ не найден.");
  return order;
}

export async function synchronizeOrderChargeWithClient(
  tx: Prisma.TransactionClient,
  tenant: TenantContext,
  orderId: string,
  actor: ChargeActor,
  targetMinor?: bigint,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenant.organizationId + ":order-charge:" + orderId},0))`;
  const order = await orderForFinance(tx, tenant, orderId);
  if (order.type !== "RENTAL") return null;
  const aggregate = await tx.financialTransaction.aggregate({
    where: { organizationId: tenant.organizationId, orderId, sourceType: "ORDER_CHARGE", sourceId: orderId },
    _sum: { revenueEffectMinor: true },
    _count: { id: true },
  });
  const recognized = aggregate._sum.revenueEffectMinor ?? BigInt(0);
  const target=targetMinor??order.totalMinor;
  const settled=await tx.financialTransaction.aggregate({where:{organizationId:tenant.organizationId,orderId,OR:[{kind:{in:["PAYMENT_RECEIVED","CUSTOMER_REFUND"]}},{kind:"REVERSAL",reversalOf:{kind:{in:["PAYMENT_RECEIVED","CUSTOMER_REFUND"]}}}]},_sum:{cashEffectMinor:true}});
  const netPaid=settled._sum.cashEffectMinor??BigInt(0);
  if(target<netPaid)throw new FinanceError("INVALID","Сначала верните клиенту оплату, превышающую новую стоимость заказа.");
  const difference = target - recognized;
  if (difference === BigInt(0)) return null;
  const kind = difference > BigInt(0) ? "RENTAL_CHARGE" as const : "DISCOUNT" as const;
  const amountMinor = difference > BigInt(0) ? difference : -difference;
  const row = await tx.financialTransaction.create({
    data: {
      organizationId: tenant.organizationId,
      branchId: order.branchId,
      customerId: order.customerId,
      orderId,
      kind,
      amountMinor,
      ...effectsFor(kind, amountMinor),
      currency: order.currency,
      sourceType: "ORDER_CHARGE",
      sourceId: orderId,
      idempotencyKey: `order-charge:${orderId}:${aggregate._count.id}:${recognized}:${target}`,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
    },
  });
  await appendAuditLog(tx, {
    organizationId: tenant.organizationId,
    branchId: order.branchId,
    actorUserId: actor.userId,
    actorMembershipId: actor.membershipId,
    action: "ORDER_CHARGE_SYNCHRONIZED",
    entityType: "FinancialTransaction",
    entityId: row.id,
    metadata: { kind, amountMinor: amountMinor.toString(), currency: order.currency, sourceType: "ORDER_CHARGE" },
  });
  return row;
}

export async function acceptOrderPayment(
  tenant: TenantContext,
  input: { orderId: string; amountMinor: bigint; paymentMethodId: string; idempotencyKey: string },
  actor: Actor,
) {
  const idempotencyKey=input.idempotencyKey.trim();
  if(input.amountMinor<=BigInt(0))throw new FinanceError("INVALID","Сумма должна быть больше нуля.");
  if(!idempotencyKey||idempotencyKey.length>150)throw new FinanceError("INVALID","Некорректный ключ операции.");
  await requirePermission({ organizationId: tenant.organizationId, membershipId: actor.membershipId, role: actor.role }, "PAYMENT_CREATE");
  return db.$transaction(async (tx) => {
    await lockOrderFinance(tx, tenant.organizationId, input.orderId);
    const order = await orderForFinance(tx, tenant, input.orderId);
    await requireUserBranchAccess(tx, tenant, actor.userId, order.branchId);
    if (!['CONFIRMED', 'COMPLETED'].includes(order.status)) throw new FinanceError("INVALID", "Оплату можно принять только по подтверждённому заказу.");
    await synchronizeOrderChargeWithClient(tx, tenant, order.id, actor);
    const replay=await tx.financialTransaction.findUnique({where:{organizationId_idempotencyKey:{organizationId:tenant.organizationId,idempotencyKey}}});
    if(replay)return createFinancialTransactionWithClient(tx, tenant, "PAYMENT_RECEIVED", {
      branchId: order.branchId,customerId: order.customerId,orderId: order.id,amountMinor: input.amountMinor,currency: order.currency,
      paymentMethodId: input.paymentMethodId,sourceType: "ORDER_PAYMENT",sourceId: order.id,idempotencyKey,reason: undefined,
    }, actor, effectsFor("PAYMENT_RECEIVED", input.amountMinor));
    const aggregate = await tx.financialTransaction.aggregate({
      where: { organizationId: tenant.organizationId, orderId: order.id, currency: order.currency },
      _sum: { obligationEffectMinor: true },
    });
    const outstanding = aggregate._sum.obligationEffectMinor ?? BigInt(0);
    if (input.amountMinor > outstanding) throw new FinanceError("INVALID", "Сумма оплаты превышает остаток по заказу.");
    return createFinancialTransactionWithClient(tx, tenant, "PAYMENT_RECEIVED", {
      branchId: order.branchId,
      customerId: order.customerId,
      orderId: order.id,
      amountMinor: input.amountMinor,
      currency: order.currency,
      paymentMethodId: input.paymentMethodId,
      sourceType: "ORDER_PAYMENT",
      sourceId: order.id,
      idempotencyKey,
      reason: undefined,
    }, actor, effectsFor("PAYMENT_RECEIVED", input.amountMinor));
  }, { maxWait: 10000, timeout: 30000 });
}

export async function refundOrderPayment(
  tenant: TenantContext,
  input: { orderId: string; paymentId: string; amountMinor: bigint; reason: string; idempotencyKey: string },
  actor: Actor,
) {
  const reason = input.reason.trim();
  if (!reason) throw new FinanceError("INVALID", "Укажите причину возврата.");
  if(input.amountMinor<=BigInt(0))throw new FinanceError("INVALID","Сумма должна быть больше нуля.");
  if(reason.length>500||!input.idempotencyKey.trim()||input.idempotencyKey.trim().length>150)throw new FinanceError("INVALID","Некорректные реквизиты возврата.");
  await requirePermission({organizationId:tenant.organizationId,membershipId:actor.membershipId,role:actor.role},"PAYMENT_REFUND");
  const payment = await db.financialTransaction.findFirst({
    where: { id: input.paymentId, organizationId: tenant.organizationId, orderId: input.orderId, kind: "PAYMENT_RECEIVED" },
    select: { id: true, branchId: true, customerId: true, orderId: true, currency: true },
  });
  if (!payment?.customerId || !payment.orderId) throw new FinanceError("NOT_FOUND", "Платёж недоступен.");
  return refundPayment(tenant, payment.id, {
    branchId: payment.branchId,
    customerId: payment.customerId,
    orderId: payment.orderId,
    amountMinor: input.amountMinor,
    currency: payment.currency,
    sourceType: "ORDER_REFUND",
    sourceId: payment.orderId,
    idempotencyKey: input.idempotencyKey.trim(),
    reason,
  }, actor);
}
