import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkflowActor } from "@/lib/workflow-access";
import { workflowScope } from "@/lib/workflow-access";
import { appendAuditLog } from "@/lib/audit/log";
import { memberHasPermission, permissionMemberSelect, type PermissionMember } from "./member";
import { isPermissionKey, PERMISSION_REGISTRY, type PermissionKey } from "./registry";

const keys = Object.keys(PERMISSION_REGISTRY) as PermissionKey[];
type ManagedMember = PermissionMember & { id: string; branchAccess: { branchId: string }[] };
async function admin(tx: Prisma.TransactionClient, actor: WorkflowActor) {
  // Serialize role edits and assignments in an organization. A stale editor
  // cannot overwrite a newer version; permission changes revoke sessions.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId + ":permissions"},0))`;
  const scope = await workflowScope(tx, actor, ["STAFF_PERMISSION_MANAGE"]);
  return scope.member;
}
function targetGuard(manager: ManagedMember | (PermissionMember & { branchAccess: { branchId: string }[] }), target: ManagedMember, actor: WorkflowActor) {
  if (target.id === actor.membershipId) throw Error("Нельзя изменять собственный доступ.");
  if (target.role === "OWNER") throw Error("Владение организацией не изменяется через набор прав.");
  if (manager.role !== "OWNER") {
    const branches = new Set(manager.branchAccess.map(row => row.branchId));
    if (!target.branchAccess.length || target.branchAccess.some(row => !branches.has(row.branchId))) throw Error("Сотрудник вне ваших филиалов.");
    if (memberHasPermission(target, "STAFF_PERMISSION_MANAGE")) throw Error("Доступ администратора прав меняет владелец.");
  }
}
function ceiling(manager: PermissionMember, proposed: PermissionKey[]) {
  if (manager.role === "OWNER") return;
  if (proposed.some(key => key === "STAFF_PERMISSION_MANAGE" || !memberHasPermission(manager, key))) throw Error("Нельзя передать права выше собственных. Право управления доступом выдаёт владелец.");
}
const memberSelect = { id: true, ...permissionMemberSelect, branchAccess: { select: { branchId: true } } } as const;
async function revoke(tx: Prisma.TransactionClient, organizationId: string, membershipIds: string[]) {
  await tx.authSession.updateMany({ where: { organizationId, membershipId: { in: membershipIds }, revokedAt: null }, data: { revokedAt: new Date() } });
}
export async function permissionRolesView(actor: WorkflowActor) {
  return db.$transaction(async tx => {
    const { member } = await workflowScope(tx, actor, ["STAFF_PERMISSION_MANAGE"]);
    const roles = await tx.permissionRole.findMany({ where: { organizationId: actor.organizationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { memberships: { select: memberSelect } } });
    const members = await tx.organizationMembership.findMany({ where: { organizationId: actor.organizationId, role: { not: "OWNER" }, ...(member.role === "OWNER" ? {} : { branchAccess: { some: { branchId: { in: member.branchAccess.map(row => row.branchId) } } } }) }, select: { ...memberSelect, permissionRoleId: true, user: { select: { displayName: true } } }, orderBy: { user: { displayName: "asc" } } });
    return {
      canGrant: keys.filter(key => member.role === "OWNER" || key !== "STAFF_PERMISSION_MANAGE" && memberHasPermission(member, key)),
      roles: roles.map(role => ({ id: role.id, name: role.name, version: role.version, permissionKeys: role.permissionKeys, memberCount: role.memberships.length, editable: role.memberships.every(target => { try { targetGuard(member, target, actor); return true; } catch { return false; } }) && (member.role === "OWNER" || role.permissionKeys.every(key => isPermissionKey(key) && key !== "STAFF_PERMISSION_MANAGE" && memberHasPermission(member, key))) })),
      members: members.filter(target => { try { targetGuard(member, target, actor); return true; } catch { return false; } }).map(target => ({ id: target.id, name: target.user.displayName, permissionRoleId: target.permissionRoleId, overrideCount: target.permissionOverrides.length })),
    };
  });
}
export async function savePermissionRole(actor: WorkflowActor, input: { id?: string; version?: number; name: string; permissionKeys: string[] }) {
  const name = input.name.trim();
  if (!name || name.length > 80 || input.permissionKeys.some(key => !isPermissionKey(key))) throw Error("Проверьте название и права набора.");
  const proposed = [...new Set(input.permissionKeys)].sort() as PermissionKey[];
  return db.$transaction(async tx => {
    const manager = await admin(tx, actor);
    ceiling(manager, proposed);
    const previous = input.id ? await tx.permissionRole.findFirst({ where: { id: input.id, organizationId: actor.organizationId }, include: { memberships: { select: memberSelect } } }) : null;
    if (input.id && (!previous || previous.version !== input.version)) throw Error("Набор уже изменён. Обновите страницу.");
    for (const target of previous?.memberships ?? []) {
      targetGuard(manager, target, actor);
      // Individual allows also count towards the resulting delegated access.
      ceiling(manager, keys.filter(key => memberHasPermission({ ...target, permissionRole: { permissionKeys: proposed } }, key)));
    }
    const role = previous
      ? await tx.permissionRole.update({ where: { id: previous.id, version: input.version }, data: { name, permissionKeys: proposed, version: { increment: 1 } } })
      : await tx.permissionRole.create({ data: { organizationId: actor.organizationId, name, permissionKeys: proposed } });
    await appendAuditLog(tx, { organizationId: actor.organizationId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "STAFF_PERMISSION_ROLE_SAVED", entityType: "PermissionRole", entityId: role.id, metadata: { previousName: previous?.name ?? null, name, version: role.version } });
    for (const key of keys) if (Boolean(previous?.permissionKeys.includes(key)) !== proposed.includes(key)) await appendAuditLog(tx, { organizationId: actor.organizationId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "STAFF_PERMISSION_CHANGED", entityType: "PermissionRole", entityId: role.id, metadata: { permissionKey: key, previousEffect: previous?.permissionKeys.includes(key) ? "ALLOW" : "DENY", effect: proposed.includes(key) ? "ALLOW" : "DENY" } });
    await revoke(tx, actor.organizationId, previous?.memberships.map(row => row.id) ?? []);
    return role.id;
  });
}
export async function assignPermissionRole(actor: WorkflowActor, targetMembershipId: string, roleId: string, expectedRoleId: string | null) {
  return db.$transaction(async tx => {
    const manager = await admin(tx, actor);
    const target = await tx.organizationMembership.findFirst({ where: { id: targetMembershipId, organizationId: actor.organizationId }, select: { ...memberSelect, permissionRoleId: true } });
    const role = await tx.permissionRole.findFirst({ where: { id: roleId, organizationId: actor.organizationId } });
    if (!target || !role) throw Error("Сотрудник или набор не найден.");
    targetGuard(manager, target, actor);
    if (target.permissionRoleId !== expectedRoleId) throw Error("Назначение уже изменено. Обновите страницу.");
    ceiling(manager, keys.filter(key => memberHasPermission({ ...target, permissionRole: role }, key)));
    await tx.organizationMembership.update({ where: { id: target.id }, data: { permissionRoleId: role.id } });
    await appendAuditLog(tx, { organizationId: actor.organizationId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "STAFF_PERMISSION_ROLE_ASSIGNED", entityType: "OrganizationMembership", entityId: target.id, metadata: { previousRoleId: target.permissionRoleId, permissionRoleId: role.id, name: role.name } });
    await revoke(tx, actor.organizationId, [target.id]);
  });
}
export async function changeIndividualPermission(actor: WorkflowActor, targetMembershipId: string, key: PermissionKey, effect: "ALLOW" | "DENY" | null) {
  if (!isPermissionKey(key) || effect !== null && effect !== "ALLOW" && effect !== "DENY") throw Error("Некорректное право.");
  return db.$transaction(async tx => {
    const manager = await admin(tx, actor);
    const target = await tx.organizationMembership.findFirst({ where: { id: targetMembershipId, organizationId: actor.organizationId }, select: memberSelect });
    if (!target) throw Error("Сотрудник не найден.");
    targetGuard(manager, target, actor);
    const next = { ...target, permissionOverrides: [...target.permissionOverrides.filter(row => row.permissionKey !== key), ...(effect ? [{ permissionKey: key, effect }] : [])] };
    ceiling(manager, keys.filter(permission => memberHasPermission(next, permission)));
    const previousEffect = target.permissionOverrides.find(row => row.permissionKey === key)?.effect ?? null;
    if (effect) await tx.membershipPermissionOverride.upsert({ where: { membershipId_permissionKey: { membershipId: target.id, permissionKey: key } }, create: { organizationId: actor.organizationId, membershipId: target.id, permissionKey: key, effect }, update: { effect } });
    else await tx.membershipPermissionOverride.deleteMany({ where: { organizationId: actor.organizationId, membershipId: target.id, permissionKey: key } });
    await appendAuditLog(tx, { organizationId: actor.organizationId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "STAFF_PERMISSION_CHANGED", entityType: "OrganizationMembership", entityId: target.id, metadata: { permissionKey: key, previousEffect, effect } });
    await revoke(tx, actor.organizationId, [target.id]);
  });
}
