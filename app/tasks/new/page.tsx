import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { TaskForm } from "@/components/TaskForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { taskOptions } from "@/lib/tasks/service";
export default async function Page({ searchParams }: { searchParams: Promise<{ branchId?: string }> }) {
  const session = await requireRouteAccess("/tasks"), params = await searchParams;
  const options = await taskOptions(session, params.branchId);
  return <AppShell active="/tasks" title="Новая задача" subtitle="Сначала выберите филиал; срок вводится в его часовом поясе">
    <Link href="/tasks">К задачам</Link>
    <form method="get" className="toolbar"><label>Филиал<select name="branchId" defaultValue={options.branch?.id}>{options.branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button className="secondary">Выбрать филиал</button></form>
    <TaskForm key={options.branch?.id} options={options} creationKey={randomUUID()}/>
  </AppShell>;
}
