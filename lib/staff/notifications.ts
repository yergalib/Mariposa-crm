import "server-only";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { canAccessRoute } from "@/lib/auth/access";
import { workflowScope, permits } from "@/lib/workflow-access";

type Notice = { id: string; label: string; href: string; at: Date; branch: string; timezone: string; overdue: boolean };
type Section = { key: string; title: string; href: string; rows: Notice[]; limited: boolean };
const limit = 100;

/** A current work queue, not persisted delivery/read receipts. Every read rechecks membership and scope. */
export async function staffNotifications(actor: AuthContext, now = new Date()) {
  const scope = await db.$transaction(tx => workflowScope(tx, actor, []));
  const manager = ["OWNER", "DIRECTOR"].includes(scope.member.role);
  const where = { ...scope.where, branch: { organizationId: actor.organizationId, status: "ACTIVE" as const },
    ...(!manager ? { assignedMembershipId: actor.membershipId } : {}) };
  const until = new Date(now.getTime() + 86400000);
  const can = (route: string, key: Parameters<typeof permits>[1]) => canAccessRoute(scope.member.role, route) && permits(scope.member, key);
  const sections: Section[] = [];
  const notice = (id: string, label: string, href: string, at: Date, branch: { name: string; timezone: string }): Notice =>
    ({ id, label, href, at, branch: branch.name, timezone: branch.timezone, overdue: at < now });
  const [tasks, fittings, pickups, returns] = await Promise.all([
    can("/tasks", "TASK_VIEW") ? db.staffTask.findMany({ where: { ...where, status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lte: until } },
      select: { id: true, title: true, dueAt: true, branch: { select: { name: true, timezone: true } } }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: limit + 1 }) : null,
    can("/fittings", "FITTING_VIEW") ? db.fitting.findMany({ where: { ...where, status: "SCHEDULED", startsAt: { lte: until } },
      select: { id: true, startsAt: true, branch: { select: { name: true, timezone: true } } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: limit + 1 }) : null,
    can("/orders", "ORDER_VIEW") && permits(scope.member, "RENTAL_ISSUE") ? db.order.findMany({ where: { ...where, type: "RENTAL", status: "CONFIRMED", rentalStartAt: { lte: until },
      items: { some: { removedAt: null } } }, select: { id: true, orderNumber: true, rentalStartAt: true, branch: { select: { name: true, timezone: true } },
      items: { where: { removedAt: null }, select: { quantity: true } }, capacityAllocations: { where: { sourceType: "ORDER" }, select: { issuedQuantity: true } } },
      orderBy: [{ rentalStartAt: "asc" }, { id: "asc" }], take: limit + 1 }) : null,
    can("/orders", "ORDER_VIEW") && permits(scope.member, "RETURN_PROCESS") ? db.order.findMany({ where: { ...where, type: "RENTAL", status: "CONFIRMED",
      OR: [{ expectedReturnAt: { lte: until } }, { expectedReturnAt: null, rentalEndAt: { lte: until } }], capacityAllocations: { some: { sourceType: "ORDER", issuedQuantity: { gt: 0 } } } },
      select: { id: true, orderNumber: true, expectedReturnAt: true, rentalEndAt: true, branch: { select: { name: true, timezone: true } },
        capacityAllocations: { where: { sourceType: "ORDER" }, select: { issuedQuantity: true, returnedQuantity: true, bulkPhysicalResolutions: { where: { kind: "LOSS_RESOLUTION" }, select: { totalQuantity: true } } } } },
      orderBy: [{ rentalEndAt: "asc" }, { id: "asc" }], take: limit + 1 }) : null,
  ]);
  if (tasks) sections.push({ key: "tasks", title: "Задачи", href: "/tasks", limited: tasks.length > limit,
    rows: tasks.slice(0, limit).map(row => notice(row.id, row.title, `/tasks/${row.id}`, row.dueAt, row.branch)) });
  if (fittings) sections.push({ key: "fittings", title: "Примерки", href: "/fittings", limited: fittings.length > limit,
    rows: fittings.slice(0, limit).map(row => notice(row.id, "Запланирована примерка", `/fittings/${row.id}`, row.startsAt, row.branch)) });
  if (pickups) sections.push({ key: "pickups", title: "Выдачи аренды", href: "/orders", limited: pickups.length > limit,
    rows: pickups.slice(0, limit).filter(row => row.items.reduce((sum, item) => sum + item.quantity, 0) > row.capacityAllocations.reduce((sum, item) => sum + item.issuedQuantity, 0))
      .map(row => notice(row.id, `Выдать заказ ${row.orderNumber}`, `/orders/${row.id}`, row.rentalStartAt!, row.branch)) });
  if (returns) sections.push({ key: "returns", title: "Возвраты аренды", href: "/returns", limited: returns.length > limit,
    rows: returns.slice(0, limit).filter(row => row.capacityAllocations.some(item => item.issuedQuantity - item.returnedQuantity - item.bulkPhysicalResolutions.reduce((sum, loss) => sum + loss.totalQuantity, 0) > 0))
      .map(row => notice(row.id, `Принять возврат ${row.orderNumber}`, `/orders/${row.id}`, (row.expectedReturnAt ?? row.rentalEndAt)!, row.branch)) });
  return { sections, now, until, manager };
}
