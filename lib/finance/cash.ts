import {memberPermissions} from "@/lib/permissions/member";
import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import type { FinancialTransactionKind, Prisma } from "@/generated/prisma/client";
import { workflowScope, permits } from "@/lib/workflow-access";
import { financePeriod, type FinanceRawFilters } from "@/lib/finance/filters";
import { acceptOrderPayment } from "@/lib/finance/order-payments";
import { createTenantContext } from "@/lib/tenant/context";
import { NON_CASH_CODES, PAYMENT_CHANNEL_LABELS } from "./payment-channel";
import { canAccessRoute } from "@/lib/auth/access";

export const CASH_KIND_LABELS = { PAYMENT_RECEIVED: "Оплата заказа", CUSTOMER_REFUND: "Возврат оплаты", DEPOSIT_RECEIVED: "Приём залога", DEPOSIT_REFUNDED: "Возврат залога", REVERSAL: "Исправление" } as const;
export type CashFilters = Pick<FinanceRawFilters, "from" | "until" | "branchId" | "paymentMethodId" | "orderQuery"> & { page?: string; kind?: string; channel?: string };
const uuid = z.string().uuid();
async function cashAccess(actor: AuthContext, branchId?: string) {
  const scope = await db.$transaction(tx => workflowScope(tx, actor, [], branchId));
  const canCreate = permits(scope.member, "PAYMENT_CREATE"), payments = permits(scope.member, "PAYMENT_VIEW"), deposits = permits(scope.member, "DEPOSIT_VIEW");
  if (!canCreate && !payments && !deposits) throw Error("Нет доступа к кассе.");
  return { ...scope, canCreate, payments, deposits, canOrder: permits(scope.member, "ORDER_VIEW"), canCustomer: permits(scope.member, "CUSTOMER_VIEW"), canReverse: canAccessRoute(scope.member.role, "/finance", memberPermissions(scope.member)) && permits(scope.member, "PAYMENT_REVERSE") };
}
export async function cashOptions(actor: AuthContext, raw: CashFilters) {
  if (raw.branchId && !uuid.safeParse(raw.branchId).success) throw Error("Некорректный филиал.");
  const scope = await cashAccess(actor, raw.branchId);
  const orderQuery = z.string().trim().max(100).parse(raw.orderQuery ?? "");
  if (orderQuery && !scope.canOrder) throw Error("Поиск по заказу недоступен.");
  const [branches, methods, orders] = await Promise.all([
    db.branch.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE", id: scope.where.branchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.paymentMethod.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, code: true, displayName: true, isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    scope.canCreate && scope.canOrder ? db.order.findMany({ where: { ...scope.where, ...(raw.branchId ? { branchId: raw.branchId } : {}), branch: { status: "ACTIVE" }, status: { in: ["CONFIRMED", "COMPLETED"] }, ...(orderQuery ? { orderNumber: { contains: orderQuery, mode: "insensitive" } } : {}) }, select: { id: true, orderNumber: true, currency: true, branch: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 51 }) : [],
  ]);
  return { branches, methods, orders: orders.slice(0, 50), moreOrders: orders.length > 50, canCreate: scope.canCreate && scope.canOrder, canView: scope.payments || scope.deposits, canReverse: scope.canReverse };
}
export async function cashMovements(actor: AuthContext, raw: CashFilters) {
  for (const value of [raw.branchId, raw.paymentMethodId]) if (value && !uuid.safeParse(value).success) throw Error("Некорректный фильтр кассы.");
  if (raw.kind && !Object.hasOwn(CASH_KIND_LABELS, raw.kind)) throw Error("Некорректный вид операции.");
  if (raw.channel && !Object.hasOwn(PAYMENT_CHANNEL_LABELS, raw.channel)) throw Error("Некорректная категория оплаты.");
  const scope = await cashAccess(actor, raw.branchId), period = financePeriod(raw);
  const kinds: FinancialTransactionKind[] = [...(scope.payments ? ["PAYMENT_RECEIVED", "CUSTOMER_REFUND"] as const : []), ...(scope.deposits ? ["DEPOSIT_RECEIVED", "DEPOSIT_REFUNDED"] as const : [])];
  const page = /^\d{1,5}$/.test(raw.page ?? "") ? Math.max(1, Number(raw.page)) : 1;
  const orderQuery = z.string().trim().max(100).parse(raw.orderQuery ?? "");
  if (orderQuery && !scope.canOrder) throw Error("Поиск по заказу недоступен.");
  const channelWhere: Prisma.FinancialTransactionWhereInput = raw.channel === "CASH" ? { paymentMethod: { code: "CASH" } } : raw.channel === "NON_CASH" ? { paymentMethod: { code: { in: NON_CASH_CODES } } } : raw.channel === "OTHER" ? { OR: [{ paymentMethodId: null }, { paymentMethod: { code: { notIn: ["CASH", ...NON_CASH_CODES] } } }] } : {};
  const where: Prisma.FinancialTransactionWhereInput = { AND: [scope.where, channelWhere, { branch: { status: "ACTIVE" }, branchId: raw.branchId || undefined, paymentMethodId: raw.paymentMethodId || undefined, occurredAt: { gte: period.from, lt: period.endExclusive }, order: orderQuery ? { orderNumber: { contains: orderQuery, mode: "insensitive" } } : undefined }, { OR: [{ kind: { in: kinds } }, { kind: "REVERSAL", reversalOf: { is: { organizationId: actor.organizationId, kind: { in: kinds } } } }] }, ...(raw.kind ? [{ OR: [{ kind: raw.kind as FinancialTransactionKind }, ...(raw.kind === "REVERSAL" ? [] : [{ kind: "REVERSAL" as const, reversalOf: { kind: raw.kind as FinancialTransactionKind } }])] } ] : [])] };
  if (!kinds.length) return { rows: [], more: false, page, period, canView: false };
  const rows = await db.financialTransaction.findMany({ where, select: { id: true, kind: true, amountMinor: true, cashEffectMinor: true, currency: true, occurredAt: true, branch: { select: { name: true, timezone: true } }, paymentMethod: { select: { displayName: true, code: true } }, actorUser: { select: { displayName: true } },
    order: scope.canOrder ? { select: { id: true, orderNumber: true } } : false,
    customer: scope.canCustomer ? { select: { id: true, firstName: true, lastName: true } } : false,
    reversal: { select: { id: true } }, reversalOf: { select: { kind: true } } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 51, skip: (page - 1) * 50 });
  return { rows: rows.slice(0, 50), more: rows.length > 50, page, period, canView: true };
}
export async function acceptCashOrderPayment(actor: AuthContext, raw: unknown) {
  const input = z.object({ orderId: uuid, paymentMethodId: uuid, amountMinor: z.string().trim().regex(/^[1-9]\d{0,17}$/, "Введите положительную целую сумму."), idempotencyKey: uuid }).parse(raw);
  const scope = await db.$transaction(tx => workflowScope(tx, actor, ["ORDER_VIEW", "PAYMENT_CREATE"]));
  const order = await db.order.findFirst({ where: { ...scope.where, id: input.orderId, branch: { status: "ACTIVE" } }, select: { id: true } });
  if (!order) throw Error("Заказ недоступен.");
  return acceptOrderPayment(createTenantContext(actor.organizationId), { ...input, amountMinor: BigInt(input.amountMinor) }, { ...actor, role: scope.member.role });
}
