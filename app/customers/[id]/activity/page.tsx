import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { createTenantContext } from "@/lib/tenant/context";
import { ORDER_EVENT_LABELS, orderEventLabel, orderStatusLabel, orderTypeLabel } from "@/lib/ui/labels";
import { CustomerOrderActivityError, customerOrderActivityHref, getCustomerOrderActivity, readCustomerOrderActivityFilters, type CustomerOrderActivityFilters } from "@/lib/customers/order-activity";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRouteAccess("/customers");
  await requirePermission(session, "CUSTOMER_VIEW");
  await requirePermission(session, "ORDER_VIEW");
  const { id } = await params;
  let filters: CustomerOrderActivityFilters = {}, data, error;
  try {
    filters = readCustomerOrderActivityFilters(await searchParams);
    data = await getCustomerOrderActivity(createTenantContext(session.organizationId), session, id, filters);
  } catch (cause) {
    if (!(cause instanceof CustomerOrderActivityError)) throw cause;
    error = cause.message;
  }
  if (!error && !data) notFound();
  const name = data ? [data.customer.firstName, data.customer.lastName].filter(Boolean).join(" ") : "";
  return <AppShell active="/customers" title={name ? `История заказов · ${name}` : "История событий заказов"} subtitle="Сохранённые события; время записи UTC" action={<Link className="secondary button-link" href={`/customers/${id}`}>К карточке клиента</Link>}>
    {error && <p className="notice error" role="alert">{error} <Link href={`/customers/${id}/activity`}>Начать заново</Link></p>}
    {data && <>
      <form action={`/customers/${id}/activity`} method="get" className="panel form-grid">
        <label>Записано с (UTC)<input type="date" name="from" defaultValue={filters.from ?? ""} /></label>
        <label>Записано по (UTC)<input type="date" name="to" defaultValue={filters.to ?? ""} /></label>
        <label>Тип заказа<select name="type" defaultValue={filters.type ?? ""}><option value="">Все типы</option><option value="RENTAL">Аренда</option><option value="SALE">Продажа</option></select></label>
        <button type="submit" className="primary">Показать</button><Link href={`/customers/${id}/activity`}>Сбросить фильтры</Link>
      </form>
      <section className="card timeline">
        <p>{data.customer.customerNumber} · Показано {data.rows.length} событий по доступным заказам и филиалам, сначала новые. Даты включают выбранные календарные дни UTC.</p>
        <p>Филиал и ссылка — по текущему заказу; имя сотрудника — из текущего профиля.</p>
        {data.rows.map(row => <article key={row.id}>
          <b>{orderEventLabel(Object.hasOwn(ORDER_EVENT_LABELS, row.eventType) ? row.eventType : "")}</b>
          {!Object.hasOwn(ORDER_EVENT_LABELS, row.eventType) && <small><code>{row.eventType}</code></small>}
          <span><time dateTime={row.createdAt.toISOString()}>{row.createdAt.toISOString().replace("T", " ").replace("Z", "")}</time> · {row.createdBy?.displayName ?? "Без пользователя"}</span>
          <Link href={`/orders/${row.order.id}`}>{row.order.orderNumber} · {orderTypeLabel(row.order.type)} · {row.order.branch.name}</Link>
          {(row.fromStatus || row.toStatus) && <small>{row.fromStatus ? orderStatusLabel(row.fromStatus) : "—"} → {row.toStatus ? orderStatusLabel(row.toStatus) : "—"}</small>}
        </article>)}
        {!data.rows.length && <p>Сохранённых событий по выбранным фильтрам и доступным заказам нет.</p>}
        <nav aria-label="Страницы истории клиента">
          {filters.cursor && <Link href={customerOrderActivityHref(id, filters)}>К первым событиям</Link>}{" "}
          {data.nextCursor && <Link href={customerOrderActivityHref(id, filters, data.nextCursor)}>Следующие 50 событий</Link>}
        </nav>
      </section>
    </>}
  </AppShell>;
}
