import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { staffNotifications } from "@/lib/staff/notifications";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
import { NotificationRefresh } from "@/components/NotificationRefresh";

export default async function Page() {
  const actor = await requireRouteAccess("/notifications");
  const data = await staffNotifications(actor);
  return <AppShell active="/notifications" title="Уведомления" subtitle="Требуют внимания сейчас или в ближайшие 24 часа" action={<form method="get" action="/notifications"><button className="secondary">Обновить</button></form>}>
    <p>{data.manager ? "Работа в доступных вам филиалах." : "События, где вы назначены ответственным."} Завершённые и отменённые события исчезают из списка после обновления.</p>
    <NotificationRefresh updatedAt={data.now.toISOString()}/>
    <div className="notification-sections">{data.sections.map(section => <section className="card" key={section.key} data-notice-kind={section.key}>
      <h2>{section.title}</h2>
      {section.limited && <p className="notice">Проверены первые 100 записей по сроку. Остальные доступны в полном разделе.</p>}
      {section.rows.length ? <ul className="notification-list">{section.rows.map(row => <li key={row.id}>
        <Link href={row.href}>{row.label}</Link><p>{formatBusinessDateTime(row.at, row.timezone)} · {row.branch} · {row.timezone}</p>
        <span>{row.overdue ? "Срок наступил — проверьте статус" : "В ближайшие 24 часа"}</span>
      </li>)}</ul> : <p>Нет событий на ближайшие 24 часа и незавершённых событий с прошедшим сроком.</p>}
      <Link href={section.href}>Открыть раздел</Link>
    </section>)}</div>
    {!data.sections.length && <p className="card">Нет доступных разделов с уведомлениями.</p>}
  </AppShell>;
}
