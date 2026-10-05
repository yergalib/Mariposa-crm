import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState, StatusChip } from "@/components/ui";
import { requireRouteAccess } from "@/lib/auth/session";
import { hasPermission, requirePermission } from "@/lib/permissions/effective";
import { getOrderPaymentListDetails } from "@/lib/finance/queries";
import { createTenantContext } from "@/lib/tenant/context";
import { getOrderFormOptions, getOrders } from "@/lib/orders/queries";
import { ORDER_LIST_FILTER_KEYS, OrderListFilterError, readOrderListFilters, RENTAL_PERIOD_FILTER_HELP } from "@/lib/orders/list-filters";
import { ORDER_STATUS_LABELS, orderStatusLabel, orderStatusTone, orderTypeLabel } from "@/lib/ui/labels";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";

const money = (value: bigint, currency: string) => `${value.toLocaleString("ru-KZ")} ${currency === "KZT" ? "₸" : currency}`;
const date = (value: Date | null, timezone: string) => value ? formatBusinessDateTime(value, timezone) : "—";

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRouteAccess("/orders");
  await requirePermission(session, "ORDER_VIEW");
  const raw = await searchParams, tenant = createTenantContext(session.organizationId);
  const value = (key: string) => typeof raw[key] === "string" ? raw[key] as string : undefined;
  const scope = { allowedBranchIds: session.hasOrganizationWideBranchAccess ? null : session.allowedBranchIds };
  let filters, filterError: string | undefined;
  try { filters = readOrderListFilters(raw); }
  catch (error) {
    if (!(error instanceof OrderListFilterError)) throw error;
    filterError = error.message;
  }
  const [options, rows, canCreate, canCreateSale, canViewPayments, canExport] = await Promise.all([
    getOrderFormOptions(tenant), filters ? getOrders(tenant, filters, scope) : [],
    hasPermission(session, "ORDER_CREATE"), hasPermission(session, "SALE_CONFIRM"),
    hasPermission(session, "PAYMENT_VIEW"), hasPermission(session, "ORDER_EXPORT")
  ]);
  const payments = canViewPayments && !filterError ? await getOrderPaymentListDetails(tenant, rows, session) : new Map();
  const exportParams = new URLSearchParams();
  for (const key of ORDER_LIST_FILTER_KEYS) if (value(key)) exportParams.set(key, value(key)!);
  const showExport = canExport && !filterError;
  return <AppShell active="/orders" title="Заказы" subtitle={filterError ? "Проверьте фильтры" : `${rows.length} ${rows.length === 1 ? "заказ" : "заказов"} по текущим фильтрам`}
    action={canCreate || showExport ? <div className="order-create-actions">
      {showExport && <a className="secondary button-link" href={`/orders/export?${exportParams}`}>↓ Excel</a>}
      {canCreate && <Link className="secondary button-link" href="/orders/new">+ Аренда</Link>}
      {canCreate && canCreateSale && <Link className="primary button-link" href="/sales/new">+ Продажа</Link>}
    </div> : undefined}>
    <form className="orders-toolbar ui-card">
      <label className="orders-search"><span>Поиск</span><input name="q" defaultValue={value("q")} placeholder="Номер, клиент или телефон" /></label>
      <label><span>Статус</span><select name="status" defaultValue={value("status")}><option value="">Все статусы</option>{Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label><span>Тип</span><select name="type" defaultValue={value("type")}><option value="">Все типы</option><option value="RENTAL">Аренда</option><option value="SALE">Продажа</option></select></label>
      <label><span>Филиал</span><select name="branchId" defaultValue={value("branchId")}><option value="">Все доступные</option>{options.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label><span>Начало интервала аренды (UTC)</span><input name="from" type="date" defaultValue={value("from")} aria-describedby="rental-period-help" disabled={value("type") === "SALE"} /></label>
      <label><span>Конец интервала аренды (UTC, не включая)</span><input name="until" type="date" defaultValue={value("until")} aria-describedby="rental-period-help" disabled={value("type") === "SALE"} /></label>
      {value("source") && <input type="hidden" name="source" value={value("source")} />}
      <button className="secondary">Применить</button>
      {ORDER_LIST_FILTER_KEYS.some(key => Boolean(raw[key])) && <Link href="/orders" className="ui-button quiet">Сбросить</Link>}
    </form>
    <p id="rental-period-help">{RENTAL_PERIOD_FILTER_HELP}</p>
    {filterError ? <p role="alert">{filterError}</p> : <div className="orders-table ui-card">
      <div className="orders-table-head"><span>Заказ и клиент</span><span>Тип / период</span><span>Филиал</span><span>Позиции</span><span>Сумма</span><span>Статус</span></div>
      {rows.map(order => {
        const payment = payments.get(order.id);
        return <Link href={`/orders/${order.id}`} className="orders-table-row" key={order.id}>
          <span className="order-identity"><b>{order.orderNumber}</b><strong>{[order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ")}</strong><small>{order.customer.contacts[0]?.value ?? "Телефон не указан"}</small></span>
          <span><b>{orderTypeLabel(order.type)}</b><small>{date(order.rentalStartAt, order.branch.timezone)} — {date(order.rentalEndAt, order.branch.timezone)}</small></span>
          <span>{order.branch.name}</span><span>{order._count.items} поз.</span>
          <span><b>{money(order.totalMinor, order.currency)}</b>{payment && <small>{payment.status === "NOT_ACCRUED" ? "Начисление не создано" : payment.status === "NOT_REQUIRED" ? "Оплата не требуется" : payment.status === "PAID" ? "Оплачено" : payment.status === "OVERPAID" ? "Переплата" : `Долг ${money(payment.outstandingMinor, order.currency)}`}</small>}</span>
          <StatusChip tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</StatusChip>
        </Link>;
      })}
      {!rows.length && <EmptyState title="Заказов не найдено" description="Измените фильтры или создайте новый заказ." />}
    </div>}
  </AppShell>;
}
