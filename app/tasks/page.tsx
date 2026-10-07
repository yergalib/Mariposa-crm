import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { listTasks, canManageTasks, TASK_STATUSES } from "@/lib/tasks/service";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";

export default async function Page({ searchParams }: { searchParams: Promise<{ mine?: string; overdue?: string; status?: string; page?: string }> }) {
  const session = await requireRouteAccess("/tasks"), filters = await searchParams;
  const [data, manage] = await Promise.all([listTasks(session, filters), canManageTasks(session)]);
  const href = (page: number) => { const params = new URLSearchParams(); for (const key of ["mine", "overdue", "status"] as const) if (typeof filters[key] === "string") params.set(key, filters[key]!); params.set("page", String(page)); return `/tasks?${params}`; };
  const now = new Date();
  return <AppShell active="/tasks" title="Задачи сотрудников" subtitle={session.role === "SELLER" ? "Назначенные вам задачи доступных филиалов" : "Задачи доступных филиалов"} action={manage ? <Link className="button secondary" href="/tasks/new">Новая задача</Link> : undefined}>
    <form method="get" className="toolbar task-filters"><label>Ответственный<select name="mine" defaultValue={filters.mine ?? ""}><option value="">Все доступные</option><option value="yes">Назначены мне</option></select></label>
      <label>Статус<select name="status" defaultValue={filters.status ?? "ACTIVE"}><option value="ACTIVE">Открытые и в работе</option><option value="ALL">Все</option>{Object.entries(TASK_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><input type="checkbox" name="overdue" value="yes" defaultChecked={filters.overdue === "yes"}/> Только просроченные открытые</label><button className="secondary">Показать</button>
    </form>
    <section className="task-list">{data.rows.map(task => <article className="card" key={task.id}><h2><Link href={`/tasks/${task.id}`}>{task.title}</Link></h2><p>{TASK_STATUSES[task.status]} · {task.branch.name}</p><p>Ответственный: {task.assignedTo.user.displayName}</p><p>Срок: {formatBusinessDateTime(task.dueAt, task.branch.timezone)} · {task.branch.timezone}{task.dueAt < now && ["OPEN", "IN_PROGRESS"].includes(task.status) && <strong className="task-overdue"> · Просрочена</strong>}</p></article>)}{!data.rows.length && <p className="card">Задач по выбранным условиям нет.</p>}</section>
    <nav className="toolbar" aria-label="Страницы задач">{data.page > 1 && <Link href={href(data.page - 1)}>Назад</Link>}<span>Страница {data.page}</span>{data.more && <Link href={href(data.page + 1)}>Далее</Link>}</nav>
  </AppShell>;
}
