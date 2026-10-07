import "server-only";
import { z } from "zod";
import { Prisma, type Order } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { workflowScope, permits, validateWorkflowAssignee } from "@/lib/workflow-access";
import { appendAuditLog } from "@/lib/audit/log";
import { getFitting } from "@/lib/fittings/service";
import { workflowOptions } from "@/lib/workspace/conversion";
import { quoteSaleVariant } from "@/lib/sales/mobile";
import { createTenantContext } from "@/lib/tenant/context";
import { OrderError } from "@/lib/orders/errors";

const keys = ["FITTING_VIEW", "FITTING_MANAGE", "ORDER_VIEW", "ORDER_CREATE", "SALE_CONFIRM", "CUSTOMER_VIEW", "CATALOG_VIEW", "INVENTORY_VIEW"] as const;
const schema = z.object({ fittingId: z.string().uuid(), branchId: z.string().uuid(), customerId: z.string().uuid(), assignedMembershipId: z.string().uuid() });
export async function fittingSalePrefill(actor: AuthContext, id: string) {
  z.string().uuid().parse(id);
  const fitting = await getFitting(actor, id);
  if (!fitting) throw new OrderError("NOT_FOUND", "Примерка недоступна.");
  const { member } = await db.$transaction(tx => workflowScope(tx, actor, [...keys], fitting.branchId));
  if (!permits(member, "FITTING_ASSIGN") && fitting.assignedMembershipId !== actor.membershipId) throw new OrderError("FORBIDDEN", "Нет права преобразовать чужую примерку.");
  if (["CANCELLED", "NO_SHOW"].includes(fitting.status)) throw new OrderError("INVALID_STATE", "Из отменённой примерки нельзя создать продажу.");
  const inquiry = fitting.inquiryId ? await db.inquiry.findFirst({ where: { id: fitting.inquiryId, organizationId: actor.organizationId, branchId: fitting.branchId }, select: { orderId: true, status: true } }) : null;
  if (fitting.inquiryId && (!inquiry || !permits(member, "LEAD_VIEW") || !permits(member, "LEAD_CONVERT_TO_ORDER"))) throw new OrderError("FORBIDDEN", "Обращение недоступно для создания заказа.");
  const existingOrderId = fitting.orderId ?? inquiry?.orderId;
  if (existingOrderId) return { fitting, existingOrderId, options: { members: [] }, quotes: [], excluded: [], assignedMembershipId: fitting.assignedMembershipId };
  if (inquiry?.status === "CLOSED") throw new OrderError("INVALID_STATE", "Из закрытой записи нельзя создать продажу.");
  const options = await workflowOptions(actor, "ORDER_VIEW", fitting.branchId);
  const quotes = [];
  const excluded = [];
  for (const item of fitting.items) {
    const quote = await quoteSaleVariant(createTenantContext(actor.organizationId), fitting.branchId, item.productVariantId);
    if (quote) quotes.push(quote);
    else excluded.push(`${item.nameSnapshot} · ${item.sizeSnapshot}`);
  }
  return { fitting, existingOrderId: null, options, quotes, excluded, assignedMembershipId: options.members.some(m => m.id === fitting.assignedMembershipId) ? fitting.assignedMembershipId : actor.membershipId };
}

// Shares lock names with rental conversion. One source cannot create both rental and sale.
// The callback is the existing SALE draft + confirmation command in this same transaction.
export async function withFittingSale(actor: AuthContext, raw: unknown, run: (tx: Prisma.TransactionClient, context: { key: string; source: string }) => Promise<Order>) {
  const input = schema.parse(raw);
  return db.$transaction(async tx => {
    const { where, member } = await workflowScope(tx, actor, [...keys], input.branchId);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`conversion:${actor.organizationId}:FITTING:${input.fittingId}`},0))`);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`fitting-row:${actor.organizationId}:${input.fittingId}`},0))`);
    const fitting = await tx.fitting.findFirst({ where: { ...where, id: input.fittingId, branchId: input.branchId } });
    if (!fitting) throw new OrderError("NOT_FOUND", "Примерка недоступна.");
    if (!permits(member, "FITTING_ASSIGN") && fitting.assignedMembershipId !== actor.membershipId) throw new OrderError("FORBIDDEN", "Нет права преобразовать чужую примерку.");
    if (fitting.inquiryId) {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`inquiry-conversion:${actor.organizationId}:${fitting.inquiryId}`},0))`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM inquiries WHERE id=${fitting.inquiryId}::uuid AND organization_id=${actor.organizationId}::uuid FOR UPDATE`);
    }
    const inquiry = fitting.inquiryId ? await tx.inquiry.findFirst({ where: { ...where, id: fitting.inquiryId, branchId: fitting.branchId } }) : null;
    if (fitting.inquiryId && (!inquiry || !permits(member, "LEAD_VIEW") || !permits(member, "LEAD_CONVERT_TO_ORDER"))) throw new OrderError("FORBIDDEN", "Обращение недоступно для создания заказа.");
    const previous = fitting.orderId ?? inquiry?.orderId;
    if (previous) {
      const order = await tx.order.findFirst({ where: { ...where, id: previous } });
      if (!order || order.type !== "SALE" || order.creationIdempotencyKey !== `fitting-sale:${fitting.id}` || order.customerId !== input.customerId || order.assignedMembershipId !== input.assignedMembershipId) throw new OrderError("INVALID_STATE", "Заказ уже создан с другими условиями. Откройте существующий заказ.");
    } else {
      if (["CANCELLED", "NO_SHOW"].includes(fitting.status) || inquiry?.status === "CLOSED") throw new OrderError("INVALID_STATE", "Из закрытой записи нельзя создать продажу.");
      if (input.assignedMembershipId !== actor.membershipId && !permits(member, "ORDER_ASSIGN")) throw new OrderError("FORBIDDEN", "Нет права назначить другого ответственного.");
      await validateWorkflowAssignee(tx, actor, fitting.branchId, input.assignedMembershipId, ["ORDER_VIEW", "ORDER_EDIT"]);
    }
    const order = await run(tx, { key: `fitting-sale:${fitting.id}`, source: fitting.source === "TELEGRAM" ? "OTHER" : fitting.source });
    if (previous) return order;
    await tx.order.update({ where: { id: order.id }, data: { assignedMembershipId: input.assignedMembershipId } });
    await tx.fitting.update({ where: { id: fitting.id }, data: { orderId: order.id, customerId: input.customerId, version: { increment: 1 } } });
    if (inquiry) await tx.inquiry.update({ where: { id: inquiry.id }, data: { orderId: order.id, customerId: input.customerId, status: "ORDER", version: { increment: 1 } } });
    const metadata = { orderId: order.id, orderType: "SALE", fittingId: fitting.id, assignedMembershipId: input.assignedMembershipId };
    await appendAuditLog(tx, { organizationId: actor.organizationId, branchId: fitting.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "SOURCE_CONVERTED_TO_ORDER", entityType: "Fitting", entityId: fitting.id, metadata });
    if (inquiry) await appendAuditLog(tx, { organizationId: actor.organizationId, branchId: fitting.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "SOURCE_CONVERTED_TO_ORDER", entityType: "Inquiry", entityId: inquiry.id, metadata });
    return order;
  }, { maxWait: 10000, timeout: 60000 });
}
