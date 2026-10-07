import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { shiftOptions, listShifts } from "@/lib/staff/shifts";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
type Filters = { branchId?: string; from?: string; until?: string; cancelled?: string; page?: string };
export default async function Page({ searchParams }: { searchParams: Promise<Filters> }) {
  const actor = await requireRouteAccess("/schedule"), filters = await searchParams;
  let options: Awaited<ReturnType<typeof shiftOptions>>, data: Awaited<ReturnType<typeof listShifts>> | null;
  try { options = await shiftOptions(actor, filters.branchId); data = options.branch ? await listShifts(actor, options.branch.id, filters) : null; }
  catch (error) { return <AppShell active="/schedule" title="График смен"><p className="notice error">{error instanceof Error ? error.message : "График недоступен."}</p><Link href="/schedule">Открыть график заново</Link></AppShell>; }
  const branch = options.branch;
  const href = (page: number) => `/schedule?${new URLSearchParams({ branchId: branch?.id ?? "", from: data?.period.fromLabel ?? "", until: data?.period.untilLabel ?? "", cancelled: filters.cancelled ?? "", page: String(page) })}`;
  return <AppShell active="/schedule" title="График смен" subtitle="Плановые смены сотрудников" action={options.canManage && branch ? <Link className="button secondary" href={`/schedule/new?branchId=${branch.id}`}>Назначить смену</Link> : undefined}>
    <p>{options.canManage ? "Назначайте сотрудника, филиал и время смены." : "Здесь показаны ваши смены в доступных филиалах."} Время указано в часовом поясе выбранного филиала.</p>
    <form className="card form-grid"><label>Филиал<select name="branchId" defaultValue={branch?.id}>{options.branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>С даты<input name="from" type="date" defaultValue={data?.period.fromLabel} required/></label><label>По дату включительно<input name="until" type="date" defaultValue={data?.period.untilLabel} required/></label><label><input name="cancelled" type="checkbox" value="yes" defaultChecked={filters.cancelled === "yes"}/> Показывать отменённые</label><button className="secondary">Показать</button></form>
    {branch && <p>{branch.name} · {branch.timezone}</p>}
    <section className="task-list">{data?.rows.map(row => <article className="card" key={row.id}><h2><Link href={`/schedule/${row.id}`}>{row.assignedTo.user.displayName}</Link></h2><p>{formatBusinessDateTime(row.startsAt, branch!.timezone)} — {formatBusinessDateTime(row.endsAt, branch!.timezone)}</p><p>{row.status === "PLANNED" ? "Запланирована" : "Отменена"}</p></article>)}{!data?.rows.length && <p className="card">Смен за выбранный период нет.</p>}</section>
    {data && <nav className="toolbar" aria-label="Страницы смен">{data.page > 1 && <Link href={href(data.page - 1)}>Назад</Link>}<span>Страница {data.page}</span>{data.more && <Link href={href(data.page + 1)}>Далее</Link>}</nav>}
  </AppShell>;
}
