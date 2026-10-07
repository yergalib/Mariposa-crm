import "server-only";
import type { Prisma, MembershipRole } from "@/generated/prisma/client";
import { workflowScope, type WorkflowActor } from "@/lib/workflow-access";
import { memberHasPermission, memberPermissions, permissionMemberSelect } from "@/lib/permissions/member";
import type { PermissionKey } from "@/lib/permissions/registry";

export async function staffDelegation(tx: Prisma.TransactionClient, actor: WorkflowActor, key: PermissionKey, input: { targetId?: string; role?: MembershipRole; branchIds?: string[]; changingAccess?: boolean }) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId + ":permissions"},0))`;
  const { member } = await workflowScope(tx, actor, [key]);
  const target = input.targetId ? await tx.organizationMembership.findFirst({ where: { id: input.targetId, organizationId: actor.organizationId }, select: { id: true, ...permissionMemberSelect, branchAccess: { select: { branchId: true } } } }) : null;
  if (input.targetId && !target) throw Error("Сотрудник не найден.");
  if (input.changingAccess && target?.id === actor.membershipId) throw Error("Нельзя изменять собственный доступ.");
  if (member.role !== "OWNER") {
    if (target?.role === "OWNER" || input.role === "OWNER") throw Error("Владение организацией меняет только владелец.");
    if (target && memberHasPermission(target, "STAFF_PERMISSION_MANAGE")) throw Error("Доступ администратора прав меняет владелец.");
    const branches = new Set(member.branchAccess.map(row => row.branchId));
    if ([...(input.branchIds ?? []), ...(target?.branchAccess.map(row => row.branchId) ?? [])].some(id => !branches.has(id)) || target && !target.branchAccess.length) throw Error("Сотрудник или филиал вне вашего доступа.");
    let proposed = target ? memberPermissions(target) : new Set<PermissionKey>();
    if (input.role && (!target || input.role !== target.role)) {
      const template = await tx.permissionRole.findFirst({ where: { organizationId: actor.organizationId, systemRole: input.role } });
      if (!template) throw Error("Набор прав не найден.");
      proposed = memberPermissions({ role: input.role, permissionRole: template, permissionOverrides: target?.permissionOverrides ?? [] });
    }
    if ([...proposed].some(permission => permission === "STAFF_PERMISSION_MANAGE" || !memberHasPermission(member, permission))) throw Error("Нельзя управлять доступом выше собственных полномочий.");
  }
  if (target && input.role && input.role !== target.role && !memberHasPermission(member, "STAFF_PERMISSION_MANAGE")) throw Error("Для смены набора нужно право управления доступом.");
  return member;
}
