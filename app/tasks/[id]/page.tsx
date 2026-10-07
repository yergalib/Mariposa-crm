import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TaskForm } from "@/components/TaskForm";
import { RetainedActionForm } from "@/components/RetainedActionForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { getTask, taskOptions, canManageTasks, TASK_STATUSES } from "@/lib/tasks/service";
import { formatBusinessDateTime, formatBusinessLocalDateTimeInput } from "@/lib/calendar/timezone";
import { taskStatusAction } from "../actions";
import { db } from "@/lib/db";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const session = await requireRouteAccess("/tasks"), { id } = await params, query = await searchParams;
  const task = await getTask(session, id);
  if (!task) notFound();
  const manage = await canManageTasks(session), canStatus = await hasPermission(session, "TASK_STATUS");
  const options = manage ? await taskOptions(session, task.branchId, "", task) : null;
  const history = await db.auditLog.findMany({ where: { organizationId: session.organizationId, entityType: "StaffTask", entityId: id, branchId: task.branchId }, select: { id: true, action: true, occurredAt: true, actorUser: { select: { displayName: true } } }, orderBy: { occurredAt: "desc" }, take: 30 });
  return <AppShell active="/tasks" title={task.title} subtitle={`${TASK_STATUSES[task.status]} · ${task.branch.name}`}>
    <Link href="/tasks">К задачам</Link>{query.saved === "1" && <p role="status" className="notice">Задача сохранена.</p>}
    <section className="card task-detail"><p style={{ whiteSpace: "pre-wrap" }}>{task.description || "Описание не указано."}</p><p>Ответственный: {task.assignedTo.user.displayName}</p><p>Срок: {formatBusinessDateTime(task.dueAt, task.branch.timezone)} · {task.branch.timezone}</p>
      {task.customer && <p>Клиент: <Link href={`/customers/${task.customer.id}`}>{task.customer.customerNumber} · {task.customer.firstName} {task.customer.lastName}</Link></p>}
      {task.order && <p>Заказ: <Link href={`/orders/${task.order.id}`}>{task.order.orderNumber}</Link></p>}
      {canStatus && <RetainedActionForm action={taskStatusAction} className="toolbar task-status-form"><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={task.version}/><label>Статус<select name="status" defaultValue={task.status}>{Object.entries(TASK_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="primary">Изменить статус</button></RetainedActionForm>}
    </section>
    {options && <details className="task-edit"><summary>Изменить задачу</summary><TaskForm key={task.version} options={options} initial={{ id, version: task.version, title: task.title, description: task.description ?? "", assignedMembershipId: task.assignedMembershipId, dueAt: formatBusinessLocalDateTimeInput(task.dueAt, task.branch.timezone), customerId: task.customerId ?? "", orderId: task.orderId ?? "", customerLabel: task.customer ? `${task.customer.customerNumber} · ${task.customer.firstName}` : undefined, orderLabel: task.order?.orderNumber }}/></details>}
    <section className="card"><h2>История задачи</h2><p>Последние 30 изменений.</p>{history.map(row => <p key={row.id}>{({ TASK_CREATED: "Создана", TASK_UPDATED: "Изменена", TASK_STATUS_CHANGED: "Изменён статус" } as Record<string, string>)[row.action] ?? "Изменение"} · {formatBusinessDateTime(row.occurredAt, task.branch.timezone)} · {row.actorUser?.displayName ?? "Система"}</p>)}</section>
  </AppShell>;
}
