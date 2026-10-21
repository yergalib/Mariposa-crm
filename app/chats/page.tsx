import "../orders/workspace.css";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { inquiriesNotInstalled, listInquiries, inquiryBranches } from "@/lib/inquiries/service";
import { SOURCE_LABELS, STATUS_LABELS } from "@/lib/inquiries/validation";
import { InquirySummary } from "@/components/InquirySummary";
import "./chats.css";

type Filters = { status?: string; source?: string; branchId?: string; mine?: string; page?: string;createdFrom?:string;createdUntil?:string;due?:string;view?:string };
export default async function Chats({ searchParams }: { searchParams: Promise<Filters> }) {
  const session = await requireRouteAccess("/chats"), filters = await searchParams;
  let result;
  try { result = await listInquiries(session, filters); }
  catch (error) {
    if (!inquiriesNotInstalled(error)) throw error;
    return <AppShell active="/chats" title="Чаты и обращения"><section className="card"><p>Очередь пока не включена. Требуется согласованное обновление базы данных.</p><Link className="secondary button-link" href="/whatsapp">Проверить наличие для ответа клиенту</Link></section></AppShell>;
  }
  const canCreate = await hasPermission(session, "LEAD_CREATE");
  const branches = await inquiryBranches(session);
  const pageLink = (page: number) => {
    const query = new URLSearchParams();
    for (const key of ["status", "source", "branchId", "mine", "createdFrom", "createdUntil", "due", "view"] as const) if (typeof filters[key] === "string") query.set(key, filters[key]!);
    query.set("page", String(page)); return `/chats?${query}`;
  };
  return <AppShell active="/chats" title="Чаты и обращения" subtitle="Заявки с сайта и обращения, добавленные сотрудниками" action={canCreate ? <Link className="primary button-link" href="/chats/new">Новое обращение</Link> : undefined}>
    <div className="inquiry-queue"><section className="card">
      <p><strong>Новое — ждёт обработки.</strong> Откройте обращение, проверьте запрос и назначьте следующий шаг.</p><details><summary>Откуда приходят обращения</summary><p>Заявки с сайта поступают автоматически. Обращение ещё не подтверждает бронь. Источник «WhatsApp» или «Telegram» сам по себе не означает подключение мессенджера.</p></details>
      <Link className="secondary button-link" href="/whatsapp">Проверить наличие для ответа клиенту</Link>
      <form method="get" className="inquiry-filters">
        {["createdFrom","createdUntil","due"].map(key=>filters[key as keyof Filters]&&<input key={key} type="hidden" name={key} value={filters[key as keyof Filters]}/>)}
        <label>Вид<select name="view" defaultValue={filters.view??"list"}><option value="list">Список</option><option value="kanban">Доска</option></select></label>
        <label>Филиал<select name="branchId" defaultValue={filters.branchId ?? ""}><option value="">Все доступные</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Статус<select name="status" defaultValue={filters.status ?? "OPEN"}><option value="OPEN">Все открытые</option><option value="ALL">Все, включая закрытые</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Источник<select name="source" defaultValue={filters.source ?? ""}><option value="">Все источники</option>{Object.entries(SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Ответственный<select name="mine" defaultValue={filters.mine ?? ""}><option value="">Все доступные</option><option value="yes">Назначены мне</option></select></label>
        <button className="secondary" type="submit">Показать</button>
      </form>
    </section>
    {!result.rows.length && <section className="card"><h2>Обращений по этим фильтрам нет</h2><p>Проверьте филиал и статус или вернитесь ко всем открытым обращениям.</p><Link className="secondary button-link" href="/chats">Сбросить фильтры</Link></section>}
    <div className={filters.view==="kanban"?"workspace-board":""}>{(filters.view==="kanban"?Object.entries(STATUS_LABELS).map(([status,label])=>({label,rows:result.rows.filter(row=>row.status===status)})):[{label:"",rows:result.rows}]).map(group=><section key={group.label} className={filters.view==="kanban"?"workspace-column":""}>{group.label&&<h2>{group.label} <span aria-label="На этой странице">· {group.rows.length}</span></h2>}
    {group.rows.map(row => <article className="card inquiry-card" key={row.id}>
      <h2><Link href={`/chats/${row.id}`}>{row.subject}</Link></h2>
      <p>{SOURCE_LABELS[row.source]} · {row.branch.name}</p>
      <InquirySummary {...row} timezone={row.branch.timezone}/><Link className="secondary button-link inquiry-open" href={`/chats/${row.id}`}>Открыть обращение →</Link>
    </article>)}
    </section>)}</div>
    <p>Страница {result.page}. Доска и список показывают одну страницу результатов.</p>
    <nav className="inquiry-pages" aria-label="Страницы обращений">{result.page > 1 && <Link href={pageLink(result.page - 1)}>← Предыдущая</Link>}{result.more && <Link href={pageLink(result.page + 1)}>Следующая →</Link>}</nav>
    </div>
  </AppShell>;
}
