import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { inquiriesNotInstalled, listInquiries, inquiryBranches } from "@/lib/inquiries/service";
import { SOURCE_LABELS, STATUS_LABELS } from "@/lib/inquiries/validation";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
import "./chats.css";

type Filters = { status?: string; source?: string; branchId?: string; mine?: string; page?: string };
export default async function Chats({ searchParams }: { searchParams: Promise<Filters> }) {
  const session = await requireRouteAccess("/chats"), filters = await searchParams;
  let result;
  try { result = await listInquiries(session, filters); }
  catch (error) {
    if (!inquiriesNotInstalled(error)) throw error;
    return <AppShell active="/chats" title="Чаты и обращения"><section className="card"><p>Очередь пока не включена. Требуется согласованное обновление базы данных.</p><Link href="/whatsapp">Проверить наличие для ответа клиенту</Link></section></AppShell>;
  }
  const canCreate = await hasPermission(session, "LEAD_CREATE");
  const branches = await inquiryBranches(session);
  const pageLink = (page: number) => {
    const query = new URLSearchParams();
    for (const key of ["status", "source", "branchId", "mine"] as const) if (typeof filters[key] === "string") query.set(key, filters[key]!);
    query.set("page", String(page)); return `/chats?${query}`;
  };
  return <AppShell active="/chats" title="Чаты и обращения" subtitle="Единая очередь · внешние каналы ещё не подключены" action={canCreate ? <Link className="secondary button-link" href="/chats/new">Новое обращение</Link> : undefined}>
    <div className="inquiry-queue"><section className="card">
      <p>Здесь сотрудники вручную фиксируют обращения. Источник обозначает канал запроса; сообщения из сайта и мессенджеров автоматически не поступают.</p>
      <Link href="/whatsapp">Проверить наличие для ответа клиенту</Link>
      <form method="get" className="inquiry-filters">
        <label>Филиал<select name="branchId" defaultValue={filters.branchId ?? ""}><option value="">Все доступные</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Статус<select name="status" defaultValue={filters.status ?? "OPEN"}><option value="OPEN">Все открытые</option><option value="ALL">Все, включая закрытые</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Источник<select name="source" defaultValue={filters.source ?? ""}><option value="">Все источники</option>{Object.entries(SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Ответственный<select name="mine" defaultValue={filters.mine ?? ""}><option value="">Все доступные</option><option value="yes">Назначены мне</option></select></label>
        <button className="secondary" type="submit">Показать</button>
      </form>
    </section>
    {!result.rows.length && <p className="card">Обращений по выбранным условиям нет.</p>}
    {result.rows.map(row => <article className="card inquiry-card" key={row.id}>
      <h2><Link href={`/chats/${row.id}`}>{row.subject}</Link></h2>
      <p>{STATUS_LABELS[row.status]} · {SOURCE_LABELS[row.source]} · {row.branch.name}</p>
      <p>Ответственный: {row.assignedTo?.user.displayName ?? "Не назначен"}</p>
      <p>Следующее действие: {row.nextAction ?? "Не указано"}{row.nextActionAt ? ` · ${formatBusinessDateTime(row.nextActionAt, row.branch.timezone)} (${row.branch.timezone})` : ""}</p>
    </article>)}
    <nav className="inquiry-pages" aria-label="Страницы обращений">{result.page > 1 && <Link href={pageLink(result.page - 1)}>← Предыдущая</Link>}{result.more && <Link href={pageLink(result.page + 1)}>Следующая →</Link>}</nav>
    </div>
  </AppShell>;
}
