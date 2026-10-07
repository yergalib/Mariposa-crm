import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import type { Prisma } from "@/generated/prisma/client";
import { workflowScope, validateWorkflowAssignee, permits } from "@/lib/workflow-access";
import { appendAuditLog } from "@/lib/audit/log";
import { addLocalDays, dateKey, localDateKey, parseDateKey, parseBusinessLocalDateTime, zonedDateTimeToUtc } from "@/lib/calendar/timezone";

const uuid = z.string().uuid();
const fields = z.object({ branchId: uuid, assignedMembershipId: uuid,
  startsAt: z.string(), endsAt: z.string() });
const manager = (role: string) => role === "OWNER" || role === "DIRECTOR";
async function access(tx: Prisma.TransactionClient, actor: AuthContext, branchId?: string, write = false) {
  const scope = await workflowScope(tx, actor, write ? ["SHIFT_VIEW", "SHIFT_MANAGE"] : ["SHIFT_VIEW"], branchId);
  if (write && !manager(scope.member.role)) throw Error("График назначает владелец или директор.");
  return { ...scope, canManage: manager(scope.member.role) && permits(scope.member, "SHIFT_MANAGE"),
    shiftWhere: { ...scope.where, branch: { organizationId: actor.organizationId, status: "ACTIVE" as const },
      ...(!manager(scope.member.role) ? { assignedMembershipId: actor.membershipId } : {}) } };
}
export async function shiftOptions(actor: AuthContext, branchId?: string) {
  if (branchId && !uuid.safeParse(branchId).success) throw Error("Некорректный филиал.");
  return db.$transaction(async tx => {
    const scope = await access(tx, actor, branchId);
    const branches = await tx.branch.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE", id: scope.where.branchId }, select: { id: true, name: true, timezone: true }, orderBy: { name: "asc" } });
    const branch = branches.find(row => row.id === (branchId || actor.defaultBranchId)) ?? branches[0] ?? null;
    const members = branch && scope.canManage ? await tx.organizationMembership.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, OR: [{ role: "OWNER" }, { branchAccess: { some: { organizationId: actor.organizationId, branchId: branch.id } } }] }, select: { id: true, role: true, permissionOverrides: { select: { permissionKey: true, effect: true } }, user: { select: { displayName: true } } }, orderBy: { user: { displayName: "asc" } } }) : [];
    return { branches, branch, canManage: scope.canManage, assignees: members.filter(member => permits(member, "SHIFT_VIEW")).map(member => ({ id: member.id, name: member.user.displayName })) };
  });
}
export function shiftPeriod(raw: { from?: string; until?: string }, timezone: string, now = new Date()) {
  const fromLabel = raw.from || localDateKey(now, timezone);
  const start = parseDateKey(fromLabel);
  if (!start) throw Error("Некорректная дата начала.");
  const untilLabel = raw.until || dateKey(addLocalDays(start, 6));
  const end = parseDateKey(untilLabel);
  if (!end) throw Error("Некорректная дата окончания.");
  const distance = Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day);
  if (distance < 0 || distance >= 366 * 86400000) throw Error("Выберите период от 1 до 366 дней.");
  return { fromLabel, untilLabel, from: zonedDateTimeToUtc(start, timezone), endExclusive: zonedDateTimeToUtc(addLocalDays(end, 1), timezone) };
}
export async function listShifts(actor: AuthContext, branchId: string, raw: { from?: string; until?: string; cancelled?: string; page?: string }) {
  return db.$transaction(async tx => {
    const scope = await access(tx, actor, uuid.parse(branchId));
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId }, select: { timezone: true } });
    const period = shiftPeriod(raw, branch.timezone), page = /^\d{1,5}$/.test(raw.page ?? "") ? Math.max(1, Number(raw.page)) : 1;
    const rows = await tx.staffShift.findMany({ where: { ...scope.shiftWhere, branchId, startsAt: { lt: period.endExclusive }, endsAt: { gt: period.from }, ...(raw.cancelled !== "yes" ? { status: "PLANNED" } : {}) },
      select: { id: true, startsAt: true, endsAt: true, status: true, assignedTo: { select: { user: { select: { displayName: true } } } } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 51, skip: (page - 1) * 50 });
    return { rows: rows.slice(0, 50), more: rows.length > 50, page, period };
  });
}
export async function getShift(actor: AuthContext, id: string) {
  if (!uuid.safeParse(id).success) return null;
  return db.$transaction(async tx => {
    const scope = await access(tx, actor);
    return tx.staffShift.findFirst({ where: { ...scope.shiftWhere, id }, include: { branch: { select: { name: true, timezone: true } }, assignedTo: { select: { user: { select: { displayName: true } } } } } });
  });
}
async function validate(tx: Prisma.TransactionClient, actor: AuthContext, input: z.infer<typeof fields>) {
  await access(tx, actor, input.branchId, true);
  await validateWorkflowAssignee(tx, actor, input.branchId, input.assignedMembershipId, ["SHIFT_VIEW"]);
  const branch = await tx.branch.findUniqueOrThrow({ where: { id: input.branchId }, select: { timezone: true } });
  const startsAt = parseBusinessLocalDateTime(input.startsAt, branch.timezone), endsAt = parseBusinessLocalDateTime(input.endsAt, branch.timezone);
  if (endsAt <= startsAt) throw Error("Окончание смены должно быть позже начала.");
  return { branchId: input.branchId, assignedMembershipId: input.assignedMembershipId, startsAt, endsAt };
}
export async function saveShift(actor: AuthContext, raw: unknown) {
  const schema = fields.extend({ id: uuid.optional(), version: z.number().int().positive().optional(), creationKey: uuid.optional() });
  const input = schema.parse(raw);
  if (input.id ? !input.version : !input.creationKey) throw Error("Обновите форму смены.");
  return db.$transaction(async tx => {
    const scope = await access(tx, actor, input.branchId, true);
    const hash = createHash("sha256").update(JSON.stringify(fields.parse(input))).digest("hex");
    if (!input.id) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId + ":shift:" + input.creationKey},0))`;
      const existing = await tx.staffShift.findUnique({ where: { organizationId_creationKey: { organizationId: actor.organizationId, creationKey: input.creationKey! } } });
      if (existing) {
        if (existing.creationHash !== hash || existing.createdByUserId !== actor.userId) throw Error("Повторный запрос отличается от исходного.");
        return existing.id;
      }
    }
    const old = input.id ? await tx.staffShift.findFirst({ where: { ...scope.shiftWhere, id: input.id } }) : null;
    if (input.id && (!old || old.branchId !== input.branchId)) throw Error("Смена недоступна. Филиал созданной смены изменить нельзя.");
    if (old?.status === "CANCELLED") throw Error("Отменённую смену нельзя редактировать. Назначьте новую.");
    const data = await validate(tx, actor, input);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId + ":shift-assignee:" + data.assignedMembershipId},0))`;
    if (await tx.staffShift.findFirst({ where: { organizationId: actor.organizationId, assignedMembershipId: data.assignedMembershipId, status: "PLANNED", id: old ? { not: old.id } : undefined, startsAt: { lt: data.endsAt }, endsAt: { gt: data.startsAt } }, select: { id: true } })) throw Error("У сотрудника уже назначена смена в это время. Выберите другой интервал.");
    let id: string;
    if (old) {
      const changed = await tx.staffShift.updateMany({ where: { ...scope.shiftWhere, id: old.id, version: input.version, status: "PLANNED" }, data: { ...data, version: { increment: 1 } } });
      if (!changed.count) throw Error("Смена уже изменена. Откройте её заново; введённые значения сохранены в форме.");
      id = old.id;
    } else id = (await tx.staffShift.create({ data: { ...data, organizationId: actor.organizationId, createdByUserId: actor.userId, creationKey: input.creationKey!, creationHash: hash } })).id;
    await appendAuditLog(tx, { organizationId: actor.organizationId, branchId: data.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: old ? "SHIFT_UPDATED" : "SHIFT_CREATED", entityType: "StaffShift", entityId: id,
      metadata: { assignedMembershipId: data.assignedMembershipId, startsAt: data.startsAt.toISOString(), endsAt: data.endsAt.toISOString(), previousAssigneeId: old?.assignedMembershipId, previousStartsAt: old?.startsAt.toISOString(), previousEndsAt: old?.endsAt.toISOString() } });
    return id;
  });
}
export async function cancelShift(actor: AuthContext, raw: unknown) {
  const input = z.object({ id: uuid, version: z.number().int().positive() }).parse(raw);
  return db.$transaction(async tx => {
    const scope = await access(tx, actor, undefined, true);
    const old = await tx.staffShift.findFirst({ where: { ...scope.shiftWhere, id: input.id } });
    if (!old) throw Error("Смена недоступна.");
    if (old.status === "CANCELLED") return old.id;
    const changed = await tx.staffShift.updateMany({ where: { ...scope.shiftWhere, id: old.id, version: input.version, status: "PLANNED" }, data: { status: "CANCELLED", version: { increment: 1 } } });
    if (!changed.count) throw Error("Смена уже изменена. Обновите страницу.");
    await appendAuditLog(tx, { organizationId: actor.organizationId, branchId: old.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "SHIFT_CANCELLED", entityType: "StaffShift", entityId: old.id, metadata: { previousStatus: old.status, status: "CANCELLED" } });
    return old.id;
  });
}
