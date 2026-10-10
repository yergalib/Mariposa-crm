import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { getReservationDetails, type ReservationParams } from "@/lib/inventory/reservations";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
import { orderStatusLabel } from "@/lib/ui/labels";
import "./reservations.css";

const sourceLabels: Record<string, string> = { ORDER: "Аренда", SALE: "Продажа", MAINTENANCE: "Обслуживание", TRANSFER: "Перемещение", MANUAL_BLOCK: "Ручная блокировка" };

export default async function Page({ searchParams }: { searchParams: Promise<ReservationParams> }) {
  const session = await requireRouteAccess("/warehouse");
  await requirePermission(session, "INVENTORY_VIEW");
  await requirePermission(session, "ORDER_VIEW");
  const raw = await searchParams;
  let data: Awaited<ReturnType<typeof getReservationDetails>>;
  try { data = await getReservationDetails(session, raw); }
  catch (error) { return <AppShell active="/warehouse" title="Резервы и доступность"><p role="alert">{error instanceof Error ? error.message : "Не удалось загрузить расшифровку."}</p><Link href="/warehouse">К складу</Link></AppShell>; }
  const { variant, branch, physical, availability } = data;
  const format = (date: Date) => formatBusinessDateTime(date, branch.timezone);
  const base = { variantId: variant.id, branch: branch.id };
  const href = (patch: Record<string, string>) => `/warehouse/reservations?${new URLSearchParams({ ...base, mode: data.mode, ...(data.mode === "dates" ? { from: data.fromInput, until: data.untilInput } : {}), ...patch })}`;
  const movements = `/warehouse/movements?${new URLSearchParams(base)}`;
  return <AppShell active="/warehouse" title="Резервы и доступность" subtitle={`${variant.product.name} · ${variant.size.code} · ${variant.sku}`}>
    <nav className="toolbar reservation-links" aria-label="Связанные записи">
      <Link href={`/warehouse?${new URLSearchParams({ branch: branch.id, q: variant.sku })}`}>← Остатки варианта</Link>
      <Link href={`/products/${variant.product.id}`}>Карточка товара</Link>
      <Link href={movements}>Движения варианта</Link>
      <Link href={`${movements}&type=RECEIPT`}>Приходы варианта</Link>
    </nav>
    <p>{branch.name} · время {branch.timezone} · {variant.product.trackingMode === "BULK" ? "Количественный учёт" : "Индивидуальные экземпляры"}</p>
    {physical ? <section className="card reservation-physical"><h2>Физическое состояние сейчас</h2><p>Всего в учёте: <b>{physical.activeFleet}</b> · На складе: <b>{physical.physicalOnHand}</b> · В аренде: <b>{physical.issuedOutstanding}</b></p><p>Резерв аренды сейчас: <b>{physical.plannedReservations}</b>. Чистка: {physical.cleaning} · Ремонт: {physical.repair}{physical.unclassifiedMaintenance > 0 && ` · Обслуживание без уточнения: ${physical.unclassifiedMaintenance}`}.</p><small>Резерв не прибавляется к остатку. Чистка и ремонт входят в складской остаток. Это состояние на {format(data.now)}, а не свободное количество на будущие даты.</small></section> : <p className="notice">Статусы и места индивидуальных экземпляров доступны в остатках варианта. Назначенные экземпляры указаны в расшифровке; неназначенные резервы тоже учитываются.</p>}
    <nav className="toolbar reservation-links" aria-label="Режим расшифровки">
      <Link aria-current={data.mode === "now" ? "page" : undefined} className={`button ${data.mode === "now" ? "" : "secondary"}`} href={href({ mode: "now", from: "", until: "" })}>Резерв сейчас</Link>
      <Link aria-current={data.mode === "dates" ? "page" : undefined} className={`button ${data.mode === "dates" ? "" : "secondary"}`} href={href({ mode: "dates", from: data.fromInput, until: data.untilInput })}>На даты</Link>
    </nav>
    <details className="reservation-date-details" open={data.mode === "dates"}><summary>Проверить даты аренды</summary><form className="card reservation-period" method="get">
      <input type="hidden" name="variantId" value={variant.id}/><input type="hidden" name="branch" value={branch.id}/><input type="hidden" name="mode" value="dates"/>
      <label>Начало · {branch.timezone}<input required type="datetime-local" name="from" defaultValue={data.fromInput}/></label>
      <label>Окончание · {branch.timezone}<input required type="datetime-local" name="until" defaultValue={data.untilInput}/></label>
      <button className="secondary">Проверить даты</button>
    </form></details>
    {availability ? <section className="card reservation-summary"><h2>Доступность на выбранный период</h2><p>{format(data.from)} — {format(data.until)}</p><dl><div><dt>Всего в учёте</dt><dd>{availability.totalCapacity}</dd></div><div><dt>Пиковая занятость</dt><dd>{availability.reservedCapacity}</dd></div><div><dt>Недоступно без активной блокировки</dt><dd>{availability.untrackedUnavailableCapacity}</dd></div><div><dt>Доступно на период</dt><dd>{availability.availableCapacity}</dd></div></dl><p>Учтён буфер после аренды: {availability.turnaroundBufferMinutes} мин. Проверка до {format(availability.effectiveBlockedUntil!)}. Строки ниже могут занимать разные части периода — их количества нельзя складывать для получения пиковой занятости.</p>{availability.untrackedUnavailableCapacity > 0 && <p className="notice">Есть временно недоступные экземпляры без активной блокировки на текущий момент. Их состояния смотрите в остатках варианта; они дополнительно уменьшают доступность.</p>}</section> : <section className="card"><h2>Невыданный резерв аренды сейчас: {data.currentReservations} ед.</h2><p>Только активные резервы, действующие на {format(data.now)}. Будущие брони, уже выданные вещи, продажи и обслуживание в эту цифру не входят. Для полной нагрузки выберите даты.</p></section>}
    <section className="card"><h2>{data.mode === "now" ? "Какие заказы держат резерв" : "Что занимает выбранный период"}</h2><p>Всего записей: {data.total}. Показаны {data.first}–{data.last}. Страница {data.page} из {data.pages}.</p>
      {!data.rows.length ? <p role="status">Записей в выбранной области нет.</p> : <div className="reservation-table-wrap"><table className="reservation-table"><thead><tr><th>Источник / заказ</th><th>Период</th><th>Количество</th><th>Учитывается</th><th>Экземпляр</th></tr></thead><tbody>{data.rows.map(row => <tr key={`${row.source}-${row.id}`}>
        <td data-label="Источник / заказ"><strong>{sourceLabels[row.source] ?? "Блокировка"}</strong>{row.order && <><Link href={`/orders/${row.order.id}`}>{row.order.orderNumber}</Link><small>{orderStatusLabel(row.order.status)}</small></>}{row.maintenanceKind && <small>{row.maintenanceKind === "CLEANING" ? "Чистка" : "Ремонт"}</small>}</td>
        <td data-label="Период">{row.order?.rentalStartAt && row.order.rentalEndAt && <span>Аренда: {format(row.order.rentalStartAt)} — {format(row.order.rentalEndAt)}</span>}<small>Блокировка: {format(row.from)} — {row.until ? format(row.until) : "без срока"}</small>{row.overdueTail && <small>Срок закончился; невозвращённые вещи продолжают занимать количество.</small>}{row.source === "MAINTENANCE" && <small>До фактического завершения обслуживания.</small>}</td>
        <td data-label="Количество">По записи: {row.quantity}{row.source === "ORDER" && <small>Выдано: {row.issued} · Возвращено: {row.returned} · Потери: {row.loss}</small>}</td>
        <td data-label="Учитывается"><strong>{row.contributes} ед.</strong><small>{data.mode === "now" ? "Невыданный резерв сейчас" : "Максимум этой записи в периоде"}</small></td>
        <td data-label="Экземпляр">{row.instance ?? (variant.product.trackingMode === "BULK" ? "Количественный учёт" : "Не назначен")}</td>
      </tr>)}</tbody></table></div>}
      <nav className="toolbar reservation-links" aria-label="Страницы расшифровки">{data.page > 1 && <Link href={href({ page: String(data.page - 1) })}>← Назад</Link>}{data.page < data.pages && <Link href={href({ page: String(data.page + 1) })}>Далее →</Link>}</nav>
    </section>
  </AppShell>;
}
