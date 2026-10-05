import "server-only";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import type { TenantContext } from "@/lib/tenant/context";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission, PermissionError } from "@/lib/permissions/effective";
import { accessibleBranchIds } from "@/lib/staff/branch-access";

export type CustomerOrderActivityFilters = { from?: string; to?: string; type?: "RENTAL" | "SALE"; cursor?: string };
export class CustomerOrderActivityError extends Error {
  constructor(message = "Проверьте даты и страницу истории.") { super(message); this.name = "CustomerOrderActivityError"; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function day(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) throw new CustomerOrderActivityError();
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new CustomerOrderActivityError();
  return date;
}
export function readCustomerOrderActivityFilters(input: Record<string, string | string[] | undefined>): CustomerOrderActivityFilters {
  const allowed = ["from", "to", "type", "cursor"], result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (!allowed.includes(key) || typeof value !== "string") throw new CustomerOrderActivityError();
    if (value) result[key] = value;
  }
  if (result.from) day(result.from);
  if (result.to) day(result.to);
  if (result.from && result.to && result.from > result.to) throw new CustomerOrderActivityError();
  if (result.type && result.type !== "RENTAL" && result.type !== "SALE") throw new CustomerOrderActivityError();
  if (result.cursor && !uuid.test(result.cursor)) throw new CustomerOrderActivityError();
  return result as CustomerOrderActivityFilters;
}
type Actor = Pick<AuthContext, "organizationId" | "membershipId" | "role">;
export async function getCustomerOrderActivity(tenant: TenantContext, actor: Actor, customerId: string, filters: CustomerOrderActivityFilters) {
  if (actor.organizationId !== tenant.organizationId) throw new PermissionError();
  await requirePermission(actor, "CUSTOMER_VIEW");
  await requirePermission(actor, "ORDER_VIEW");
  if (!uuid.test(customerId)) return null;
  const branches = await accessibleBranchIds(tenant, actor.membershipId);
  const customer = await db.customer.findFirst({ where: { id: customerId, organizationId: tenant.organizationId }, select: { id: true, customerNumber: true, firstName: true, lastName: true } });
  if (!customer) return null;
  const where: Prisma.OrderEventWhereInput = {
    organizationId: tenant.organizationId,
    order: { organizationId: tenant.organizationId, customerId, type: filters.type, branchId: branches ? { in: branches } : undefined },
    createdAt: { ...(filters.from ? { gte: day(filters.from) } : {}), ...(filters.to ? { lt: new Date(day(filters.to).getTime() + 86400000) } : {}) },
  };
  const cursor = filters.cursor ? await db.orderEvent.findFirst({ where: { AND: [where, { id: filters.cursor }] }, select: { id: true, createdAt: true } }) : null;
  if (filters.cursor && !cursor) throw new CustomerOrderActivityError("Страница недоступна для выбранного клиента, периода и филиалов. Начните историю заново.");
  const rows = await db.orderEvent.findMany({ where: cursor ? { AND: [where, { OR: [
    { createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } },
  ] }] } : where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
    select: { id: true, eventType: true, fromStatus: true, toStatus: true, createdAt: true,
      createdBy: { select: { displayName: true } },
      order: { select: { id: true, orderNumber: true, type: true, branch: { select: { name: true } } } } },
  });
  return { customer, rows: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null };
}
export function customerOrderActivityHref(customerId: string, filters: CustomerOrderActivityFilters, cursor?: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && key !== "cursor") params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  return `/customers/${customerId}/activity` + (params.size ? "?" + params.toString() : "");
}
