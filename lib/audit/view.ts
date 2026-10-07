import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import type { TenantContext } from "@/lib/tenant/context";
import { PermissionError, requirePermission } from "@/lib/permissions/effective";
import { accessibleBranchIds } from "@/lib/staff/branch-access";

const results = ["SUCCESS", "DENIED", "FAILED"] as const;
const sources = ["CRM", "API", "SYSTEM"] as const;
export type AuditLogFilters = { from?: string; to?: string; branchId?: string; actorUserId?: string; action?: string; entityType?: string;
  result?: typeof results[number]; source?: typeof sources[number]; cursor?: string };
export class AuditLogFilterError extends Error {
  constructor(message = "Проверьте даты, фильтры и страницу журнала.") { super(message); this.name = "AuditLogFilterError"; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function day(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) throw new AuditLogFilterError();
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AuditLogFilterError();
  return date;
}
export function readAuditLogFilters(input: Record<string, string | string[] | undefined>): AuditLogFilters {
  const allowed = ["from", "to", "branchId", "actorUserId", "action", "entityType", "result", "source", "cursor"];
  const parsed: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (!allowed.includes(key) || typeof value !== "string") throw new AuditLogFilterError();
    if (value) parsed[key] = value;
  }
  if (parsed.from) day(parsed.from);
  if (parsed.to) day(parsed.to);
  if (parsed.from && parsed.to && parsed.from > parsed.to) throw new AuditLogFilterError();
  for (const key of ["branchId", "actorUserId", "cursor"]) if (parsed[key] && !uuid.test(parsed[key])) throw new AuditLogFilterError();
  if (parsed.action && (!/^[A-Za-z0-9_.:-]+$/.test(parsed.action) || parsed.action.length > 120)) throw new AuditLogFilterError();
  if (parsed.entityType && (!/^[A-Za-z0-9_.:-]+$/.test(parsed.entityType) || parsed.entityType.length > 80)) throw new AuditLogFilterError();
  if (parsed.result && !results.includes(parsed.result as typeof results[number])) throw new AuditLogFilterError();
  if (parsed.source && !sources.includes(parsed.source as typeof sources[number])) throw new AuditLogFilterError();
  return parsed as AuditLogFilters;
}
type Actor = Pick<AuthContext, "organizationId" | "membershipId" | "role">;
export async function getAuditLogPage(tenant: TenantContext, actor: Actor, filters: AuditLogFilters) {
  if (actor.organizationId !== tenant.organizationId) throw new PermissionError();
  await requirePermission(actor, "AUDIT_LOG_VIEW");
  const branchIds = await accessibleBranchIds(tenant, actor.membershipId);
  if (filters.branchId && branchIds && !branchIds.includes(filters.branchId)) throw new PermissionError("Филиал недоступен.");
  const where: Prisma.AuditLogWhereInput = {
    organizationId: tenant.organizationId,
    // Unassigned org-wide events have no demonstrable branch scope: only org-wide readers see them.
    branchId: filters.branchId ?? (branchIds ? { in: branchIds } : undefined),
    actorUserId: filters.actorUserId, action: filters.action, entityType: filters.entityType, result: filters.result, source: filters.source,
    occurredAt: { ...(filters.from ? { gte: day(filters.from) } : {}), ...(filters.to ? { lt: new Date(day(filters.to).getTime() + 86400000) } : {}) },
  };
  const cursor = filters.cursor ? await db.auditLog.findFirst({ where: { AND: [where, { id: filters.cursor }] }, select: { id: true, occurredAt: true } }) : null;
  if (filters.cursor && !cursor) throw new AuditLogFilterError("Страница недоступна для выбранных фильтров и филиалов. Начните журнал заново.");
  const rows = await db.auditLog.findMany({ where: cursor ? { AND: [where, { OR: [
    { occurredAt: { lt: cursor.occurredAt } }, { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
  ] }] } : where,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 51,
    select: { id: true, action: true, entityType: true, entityId: true, result: true, source: true, occurredAt: true,
      branch: { select: { name: true } }, actorUser: { select: { displayName: true } } },
  });
  const branches = await db.branch.findMany({ where: { organizationId: tenant.organizationId, id: branchIds ? { in: branchIds } : undefined }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return { rows: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null, branches };
}
export function auditLogPageHref(filters: AuditLogFilters, cursor?: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && key !== "cursor") params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  return "/settings/audit" + (params.size ? "?" + params.toString() : "");
}
