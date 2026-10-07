import "server-only";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { hasPermission, requirePermission } from "@/lib/permissions/effective";
import { accessibleBranchIds } from "@/lib/staff/branch-access";
import { createTenantContext } from "@/lib/tenant/context";
import { canAccessRoute } from "@/lib/auth/access";
import type { PermissionKey } from "@/lib/permissions/registry";

type Actor = Pick<AuthContext, "organizationId" | "membershipId" | "role">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function auditActorOptions(actor: Actor) {
  await requirePermission(actor, "AUDIT_LOG_VIEW");
  const branches = await accessibleBranchIds(createTenantContext(actor.organizationId), actor.membershipId);
  const grouped = await db.auditLog.groupBy({ by: ["actorUserId"], where: { organizationId: actor.organizationId,
    branchId: branches ? { in: branches } : undefined, actorUserId: { not: null } }, orderBy: { actorUserId: "asc" }, take: 201 });
  const actors = await db.user.findMany({ where: { id: { in: grouped.slice(0, 200).flatMap(row => row.actorUserId ? [row.actorUserId] : []) } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } });
  return { actors, limited: grouped.length > 200 };
}
/** Resolve only whitelisted current objects, with their own route/permission/scope. Never link payload URLs. */
export async function auditObjectLinks(actor: Actor, rows: Array<{ id: string; entityType: string; entityId: string | null }>) {
  await requirePermission(actor, "AUDIT_LOG_VIEW");
  const branches = await accessibleBranchIds(createTenantContext(actor.organizationId), actor.membershipId);
  const branchId = branches ? { in: branches } : undefined, organizationId = actor.organizationId;
  const links: Record<string, { href: string; label: string }> = {};
  const allowed = async (route: string, permission: PermissionKey) => canAccessRoute(actor.role, route) && await hasPermission(actor, permission);
  const ids = (type: string) => rows.filter(row => row.entityType === type && row.entityId && uuid.test(row.entityId)).map(row => row.entityId!);
  const add = (type: string, targets: Array<{ id: string; label: string }>, path: string) => {
    const found = new Map(targets.map(row => [row.id, row.label]));
    for (const row of rows) if (row.entityType === type && row.entityId && found.has(row.entityId)) links[row.id] = { href: `${path}/${row.entityId}`, label: found.get(row.entityId)! };
  };
  if (ids("Order").length && await allowed("/orders", "ORDER_VIEW")) {
    const targets = await db.order.findMany({ where: { id: { in: ids("Order") }, organizationId, branchId, branch: { organizationId, status: "ACTIVE" } }, select: { id: true, orderNumber: true } });
    add("Order", targets.map(row => ({ id: row.id, label: row.orderNumber })), "/orders");
  }
  if (ids("Customer").length && await allowed("/customers", "CUSTOMER_VIEW")) {
    const targets = await db.customer.findMany({ where: { id: { in: ids("Customer") }, organizationId }, select: { id: true, customerNumber: true } });
    add("Customer", targets.map(row => ({ id: row.id, label: row.customerNumber })), "/customers");
  }
  if (ids("StaffTask").length && await allowed("/tasks", "TASK_VIEW")) {
    const targets = await db.staffTask.findMany({ where: { id: { in: ids("StaffTask") }, organizationId, branchId, branch: { status: "ACTIVE", organizationId }, assignedMembershipId: actor.role === "SELLER" ? actor.membershipId : undefined }, select: { id: true } });
    add("StaffTask", targets.map(row => ({ id: row.id, label: "Открыть задачу" })), "/tasks");
  }
  if (ids("StaffShift").length && await allowed("/schedule", "SHIFT_VIEW")) {
    const targets = await db.staffShift.findMany({ where: { id: { in: ids("StaffShift") }, organizationId, branchId, branch: { organizationId, status: "ACTIVE" }, ...(!["OWNER", "DIRECTOR"].includes(actor.role) ? { assignedMembershipId: actor.membershipId } : {}) }, select: { id: true } });
    add("StaffShift", targets.map(row => ({ id: row.id, label: "Открыть смену" })), "/schedule");
  }
  if (ids("Inquiry").length && await allowed("/chats", "LEAD_VIEW")) {
    const targets = await db.inquiry.findMany({ where: { id: { in: ids("Inquiry") }, organizationId, branchId, branch: { status: "ACTIVE", organizationId } }, select: { id: true } });
    add("Inquiry", targets.map(row => ({ id: row.id, label: "Открыть обращение" })), "/chats");
  }
  return links;
}
