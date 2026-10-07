import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import type { Prisma } from "@/generated/prisma/client";
import { hasPermission, requirePermission } from "@/lib/permissions/effective";
import { defaultHasPermission } from "@/lib/permissions/registry";
import { accessibleBranchIds, requireBranchAccess } from "@/lib/staff/branch-access";
import { createTenantContext } from "@/lib/tenant/context";
import { appendAuditLog } from "@/lib/audit/log";
import { parseBusinessLocalDateTime } from "@/lib/calendar/timezone";

export const TASK_STATUSES = { OPEN: "Открыта", IN_PROGRESS: "В работе", DONE: "Завершена", CANCELLED: "Отменена" } as const;
const statusSchema = z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]);
const optionalId = z.union([z.literal(""), z.string().uuid()]);
const fields = z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().max(4000),
  branchId: z.string().uuid(), assignedMembershipId: z.string().uuid(), dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  customerId: optionalId, orderId: optionalId });
export class TaskError extends Error {}
export async function canManageTasks(s: AuthContext) {
  return (s.role === "OWNER" || s.role === "DIRECTOR") && await hasPermission(s, "TASK_MANAGE");
}
async function scope(s: AuthContext): Promise<Prisma.StaffTaskWhereInput> {
  await requirePermission(s, "TASK_VIEW");
  if (!["OWNER", "DIRECTOR", "SELLER"].includes(s.role)) throw new TaskError("Раздел задач недоступен.");
  const branches = await accessibleBranchIds(createTenantContext(s.organizationId), s.membershipId);
  return { organizationId: s.organizationId, branchId: branches ? { in: branches } : undefined,
    branch: { organizationId: s.organizationId, status: "ACTIVE" }, assignedMembershipId: s.role === "SELLER" ? s.membershipId : undefined };
}
async function manage(s: AuthContext) {
  await scope(s);
  if (!await canManageTasks(s)) throw new TaskError("Изменять условия задачи может руководитель.");
}
export async function listTasks(s: AuthContext, input: { mine?: string; overdue?: string; status?: string; page?: string }) {
  const page = /^\d{1,5}$/.test(input.page ?? "") ? Math.max(1, Number(input.page)) : 1;
  const status = statusSchema.safeParse(input.status);
  const where: Prisma.StaffTaskWhereInput = { AND: [await scope(s), {
    assignedMembershipId: input.mine === "yes" ? s.membershipId : undefined,
    status: input.overdue === "yes" ? { in: ["OPEN", "IN_PROGRESS"] } : status.success ? status.data : input.status === "ALL" ? undefined : { in: ["OPEN", "IN_PROGRESS"] },
    dueAt: input.overdue === "yes" ? { lt: new Date() } : undefined,
  }] };
  const rows = await db.staffTask.findMany({ where, select: { id: true, title: true, status: true, dueAt: true,
    branch: { select: { name: true, timezone: true } }, assignedTo: { select: { user: { select: { displayName: true } } } } },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }], skip: (page - 1) * 50, take: 51 });
  return { rows: rows.slice(0, 50), more: rows.length > 50, page };
}
export async function getTask(s: AuthContext, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const task = await db.staffTask.findFirst({ where: { AND: [await scope(s), { id }] }, include: {
    branch: { select: { name: true, timezone: true } }, assignedTo: { select: { user: { select: { displayName: true } } } },
  } });
  if (!task) return null;
  const [canCustomer, canOrder] = await Promise.all([hasPermission(s, "CUSTOMER_VIEW"), hasPermission(s, "ORDER_VIEW")]);
  const [customer, order] = await Promise.all([
    task.customerId && canCustomer ? db.customer.findFirst({ where: { id: task.customerId, organizationId: s.organizationId }, select: { id: true, firstName: true, lastName: true, customerNumber: true } }) : null,
    task.orderId && canOrder ? db.order.findFirst({ where: { id: task.orderId, organizationId: s.organizationId, branchId: task.branchId }, select: { id: true, orderNumber: true } }) : null,
  ]);
  return { ...task, customerId: customer?.id ?? null, orderId: order?.id ?? null, customer, order };
}
export async function taskOptions(s: AuthContext, requestedBranch?: string, search = "", selected?: { customerId: string | null; orderId: string | null }) {
  await manage(s);
  const ids = await accessibleBranchIds(createTenantContext(s.organizationId), s.membershipId);
  const branches = await db.branch.findMany({ where: { organizationId: s.organizationId, status: "ACTIVE", id: ids ? { in: ids } : undefined }, select: { id: true, name: true, timezone: true }, orderBy: { name: "asc" } });
  const branch = requestedBranch ? branches.find(row => row.id === requestedBranch) : branches.find(row => row.id === s.defaultBranchId) ?? branches[0];
  const [canCustomer, canOrder] = await Promise.all([hasPermission(s, "CUSTOMER_VIEW"), hasPermission(s, "ORDER_VIEW")]);
  const q = search.trim().slice(0, 100);
  if (!branch) return { branches, branch: null, assignees: [], customers: [], orders: [], canCustomer, canOrder };
  const [members, customers, orders] = await Promise.all([
    db.organizationMembership.findMany({ where: { organizationId: s.organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, role: { in: ["OWNER", "DIRECTOR", "SELLER"] },
      OR: [{ role: "OWNER" }, { branchAccess: { some: { organizationId: s.organizationId, branchId: branch.id } } }] }, select: { id: true, role: true, permissionOverrides: { select: { permissionKey: true, effect: true } }, user: { select: { displayName: true } } }, orderBy: { user: { displayName: "asc" } } }),
    canCustomer ? db.customer.findMany({ where: { organizationId: s.organizationId, OR: [{ id: selected?.customerId ?? undefined, ...(selected?.customerId ? {} : { id: { in: [] } }) }, { status: "ACTIVE", ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { customerNumber: { contains: q, mode: "insensitive" } }] } : {}) }] }, select: { id: true, firstName: true, lastName: true, customerNumber: true }, orderBy: { customerNumber: "asc" }, take: 51 }) : [],
    canOrder ? db.order.findMany({ where: { organizationId: s.organizationId, branchId: branch.id, ...(q ? { OR: [{ id: selected?.orderId ?? undefined, ...(selected?.orderId ? {} : { id: { in: [] } }) }, { orderNumber: { contains: q, mode: "insensitive" } }] } : {}) }, select: { id: true, orderNumber: true }, orderBy: { createdAt: "desc" }, take: 51 }) : [],
  ]);
  const assignees = members.filter(member => member.role === "OWNER" || (member.permissionOverrides.find(row => row.permissionKey === "TASK_VIEW")?.effect ?? (defaultHasPermission(member.role, "TASK_VIEW") ? "ALLOW" : "DENY")) === "ALLOW").map(member => ({ id: member.id, name: member.user.displayName }));
  return { branches, branch, assignees, customers, orders, canCustomer, canOrder };
}
async function validate(tx: Prisma.TransactionClient, s: AuthContext, input: z.infer<typeof fields>) {
  await requireBranchAccess(createTenantContext(s.organizationId), s.membershipId, input.branchId);
  const [branch, assignee] = await Promise.all([
    tx.branch.findFirst({ where: { id: input.branchId, organizationId: s.organizationId, status: "ACTIVE" }, select: { timezone: true } }),
    tx.organizationMembership.findFirst({ where: { id: input.assignedMembershipId, organizationId: s.organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, role: { in: ["OWNER", "DIRECTOR", "SELLER"] }, OR: [{ role: "OWNER" }, { branchAccess: { some: { organizationId: s.organizationId, branchId: input.branchId } } }] }, select: { role: true, permissionOverrides: { select: { permissionKey: true, effect: true } } } }),
  ]);
  if (!branch || !assignee || assignee.role !== "OWNER" && (assignee.permissionOverrides.find(row => row.permissionKey === "TASK_VIEW")?.effect ?? (defaultHasPermission(assignee.role, "TASK_VIEW") ? "ALLOW" : "DENY")) !== "ALLOW") throw new TaskError("Филиал или ответственный недоступен.");
  if (input.customerId) {
    await requirePermission(s, "CUSTOMER_VIEW");
    if (!await tx.customer.findFirst({ where: { id: input.customerId, organizationId: s.organizationId }, select: { id: true } })) throw new TaskError("Клиент недоступен.");
  }
  if (input.orderId) {
    await requirePermission(s, "ORDER_VIEW");
    if (!await tx.order.findFirst({ where: { id: input.orderId, organizationId: s.organizationId, branchId: input.branchId, customerId: input.customerId || undefined }, select: { id: true } })) throw new TaskError("Заказ недоступен либо относится к другому клиенту/филиалу.");
  }
  let dueAt: Date;
  try { dueAt = parseBusinessLocalDateTime(input.dueAt, branch.timezone); } catch { throw new TaskError("Проверьте срок и часовой пояс филиала."); }
  return { title: input.title, description: input.description || null, branchId: input.branchId, assignedMembershipId: input.assignedMembershipId, dueAt, customerId: input.customerId || null, orderId: input.orderId || null };
}
export async function createTask(s: AuthContext, raw: unknown) {
  await manage(s);
  const parsed = fields.extend({ creationKey: z.string().uuid() }).safeParse(raw);
  if (!parsed.success) throw new TaskError("Проверьте название, ответственного, срок и длину описания.");
  const input = parsed.data, hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${s.organizationId + ":task:" + input.creationKey},0))`;
    const existing = await tx.staffTask.findUnique({ where: { organizationId_creationKey: { organizationId: s.organizationId, creationKey: input.creationKey } } });
    if (existing) {
      if (existing.creationHash !== hash || existing.createdByUserId !== s.userId) throw new TaskError("Повторный запрос отличается от исходного. Обновите форму.");
      await requireBranchAccess(createTenantContext(s.organizationId), s.membershipId, existing.branchId);
      return existing.id;
    }
    const data = await validate(tx, s, input);
    const task = await tx.staffTask.create({ data: { ...data, organizationId: s.organizationId, createdByUserId: s.userId, creationKey: input.creationKey, creationHash: hash } });
    await appendAuditLog(tx, { organizationId: s.organizationId, branchId: task.branchId, actorUserId: s.userId, actorMembershipId: s.membershipId, action: "TASK_CREATED", entityType: "StaffTask", entityId: task.id, metadata: { assignedMembershipId: task.assignedMembershipId, dueAt: task.dueAt.toISOString(), status: task.status } });
    return task.id;
  });
}
export async function updateTask(s: AuthContext, raw: unknown) {
  await manage(s);
  const parsed = fields.extend({ id: z.string().uuid(), version: z.number().int().positive() }).safeParse(raw);
  if (!parsed.success) throw new TaskError("Проверьте поля задачи.");
  const input = parsed.data, allowed = await scope(s);
  return db.$transaction(async tx => {
    const old = await tx.staffTask.findFirst({ where: { AND: [allowed, { id: input.id }] } });
    if (!old) throw new TaskError("Задача недоступна.");
    if (old.branchId !== input.branchId) throw new TaskError("Филиал созданной задачи нельзя менять.");
    // Hidden linked entities cannot be cleared or reassigned by an actor lacking their permissions.
    const canCustomer = await hasPermission(s, "CUSTOMER_VIEW"), canOrder = await hasPermission(s, "ORDER_VIEW");
    if (!canCustomer && input.customerId || !canOrder && input.orderId) throw new TaskError("Связанный объект недоступен.");
    const data = await validate(tx, s, input);
    if (!canCustomer) data.customerId = old.customerId;
    if (!canOrder) data.orderId = old.orderId;
    if (data.orderId && data.customerId && !await tx.order.findFirst({ where: { id: data.orderId, organizationId: s.organizationId, branchId: old.branchId, customerId: data.customerId }, select: { id: true } })) throw new TaskError("Связи клиента и заказа не совпадают.");
    const changed = await tx.staffTask.updateMany({ where: { AND: [allowed, { id: old.id, version: input.version }] }, data: { ...data, version: { increment: 1 } } });
    if (!changed.count) throw new TaskError("Задача уже изменена. Откройте её заново; ваш ввод сохранён.");
    await appendAuditLog(tx, { organizationId: s.organizationId, branchId: old.branchId, actorUserId: s.userId, actorMembershipId: s.membershipId, action: "TASK_UPDATED", entityType: "StaffTask", entityId: old.id, metadata: { previousAssigneeId: old.assignedMembershipId, assignedMembershipId: data.assignedMembershipId, previousDueAt: old.dueAt.toISOString(), dueAt: data.dueAt.toISOString(), detailsChanged: old.title !== data.title || old.description !== data.description } });
    return old.id;
  });
}
export async function setTaskStatus(s: AuthContext, raw: unknown) {
  const allowed = await scope(s);
  await requirePermission(s, "TASK_STATUS");
  const parsed = z.object({ id: z.string().uuid(), version: z.number().int().positive(), status: statusSchema }).safeParse(raw);
  if (!parsed.success) throw new TaskError("Некорректный статус задачи.");
  const input = parsed.data;
  return db.$transaction(async tx => {
    const old = await tx.staffTask.findFirst({ where: { AND: [allowed, { id: input.id }] } });
    if (!old) throw new TaskError("Задача недоступна.");
    if (old.status === input.status) return old.id;
    const changed = await tx.staffTask.updateMany({ where: { AND: [allowed, { id: old.id, version: input.version }] }, data: { status: input.status, completedAt: input.status === "DONE" ? new Date() : null, version: { increment: 1 } } });
    if (!changed.count) throw new TaskError("Задача уже изменена. Обновите страницу.");
    await appendAuditLog(tx, { organizationId: s.organizationId, branchId: old.branchId, actorUserId: s.userId, actorMembershipId: s.membershipId, action: "TASK_STATUS_CHANGED", entityType: "StaffTask", entityId: old.id, metadata: { previousStatus: old.status, status: input.status } });
    return old.id;
  });
}
