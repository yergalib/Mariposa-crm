import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { CustomerOrderActivityError } from "@/lib/customers/order-activity";
import { TIMELINE_CATEGORIES, customerTimelineHref, getCustomerTimeline, readCustomerTimelineFilters, timelineEventLabel, timelineStatusLabel, type TimelineFilters } from "@/lib/customers/timeline";

const time = (value: string) => new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC");
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRouteAccess("/customers");
  await requirePermission(session, "CUSTOMER_VIEW");
  const { id } = await params;
  let filters: TimelineFilters = {}, data, error;
  try {
    filters = readCustomerTimelineFilters(await searchParams);
    data = await getCustomerTimeline(session, id, filters);
  } catch (cause) {
    if (!(cause instanceof CustomerOrderActivityError)) throw cause;
    error = cause.message;
  }
  if (!error && !data) notFound();
  const name = data ? [data.customer.firstName, data.customer.lastName].filter(Boolean).join(" ") : "";
  return <AppShell active="/customers" title={name ? `Лента клиента · ${name}` : "Лента клиента"} subtitle="Сохранённые события из доступных разделов" action={<Link className="secondary button-link" href={`/customers/${id}`}>К карточке клиента</Link>}>
    {error && <p className="notice error" role="alert">{error} <Link href={`/customers/${id}/activity`}>Начать заново</Link></p>}
    {data && <>
      <form action={`/customers/${id}/activity`} method="get" className="panel form-grid" aria-label="Фильтры ленты клиента">
        <label>С даты (UTC)<input type="date" name="from" defaultValue={filters.from ?? ""}/></label>
        <label>По дату (UTC)<input type="date" name="to" defaultValue={filters.to ?? ""}/></label>
        <label>События<select name="category" defaultValue={filters.category ?? ""}><option value="">Все доступные</option>{data.allowed.map(category => <option key={category} value={category}>{TIMELINE_CATEGORIES[category]}</option>)}</select></label>
        {filters.type && <input type="hidden" name="type" value={filters.type}/>}
        <button type="submit" className="primary">Показать</button><Link href={`/customers/${id}/activity`}>Сбросить фильтры</Link>
      </form>
      {filters.type && <p role="status">Показана прежняя выборка событий заказов: {filters.type === "RENTAL" ? "аренда" : "продажи"}. Для других событий сбросьте фильтры.</p>}
      <section className="card timeline customer-timeline" aria-label="Хронология клиента">
        <p>{data.customer.customerNumber} · Показано {data.rows.length} событий, сначала новые. Обе выбранные даты включены.</p>
        <details><summary>Что означает история</summary><p>Показаны сохранённые события и даты создания записей, а не история, восстановленная из текущих статусов. У финансовых операций — дата операции; у остальных — время записи. Связи с клиентом, названия и доступ к филиалам проверяются по текущим данным.</p><p>Статус примерки в записи об изменении — сохранённая отметка, не доказательство точного времени визита. Заметки показаны в текущей редакции; прежние версии и архивные заметки здесь недоступны. Повторные записи об одном действии не дублируются.</p></details>
        <p><Link href={`/customers/${id}#notes`}>Заметки и комментарии в карточке клиента</Link></p>
        {data.rows.map(row => <article key={row.key} data-timeline-key={row.key} data-timeline-category={row.category}>
          <small>{TIMELINE_CATEGORIES[row.category]}</small><b>{timelineEventLabel(row.code)}</b>
          <time dateTime={row.at}>{time(row.at)}</time>
          {row.recordedAt && Math.abs(Date.parse(row.recordedAt)-Date.parse(row.at))>1000 && <small>Записано в CRM: {time(row.recordedAt)}</small>}
          <Link href={row.href}>{row.label}{row.branch ? ` · ${row.branch}` : ""}</Link>
          {row.status && <small>{row.previousStatus ? `${timelineStatusLabel(row.category,row.previousStatus)} → ` : "Зафиксирован статус: "}{timelineStatusLabel(row.category,row.status)}</small>}
          {row.amount !== undefined && <strong>{BigInt(row.amount).toLocaleString("ru-KZ")} {row.currency}</strong>}
          {row.text !== undefined && <><p className="timeline-note">{row.text}</p><small>Текущая редакция заметки{row.editedAt && Date.parse(row.editedAt)!==Date.parse(row.at) ? ` · изменена ${time(row.editedAt)}` : ""}. Внутренняя информация CRM.</small></>}
        </article>)}
        {!data.rows.length && <p role="status">Сохранённых событий по выбранным фильтрам и доступным разделам нет.</p>}
        <nav aria-label="Страницы ленты клиента">{filters.cursor && <Link href={customerTimelineHref(id,filters)}>К первым событиям</Link>}{" "}{data.nextCursor && <Link href={customerTimelineHref(id,filters,data.nextCursor)}>Следующие 50 событий</Link>}</nav>
      </section>
    </>}
  </AppShell>;
}
