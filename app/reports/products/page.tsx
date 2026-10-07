import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { financeFilterOptions } from "@/lib/finance/filters";
import { getProductReport, type ProductReportFilters } from "@/lib/reports/products";

const money = (value: bigint, currency: string) => `${value.toLocaleString("ru-KZ")} ${currency === "KZT" ? "₸" : currency}`;
export default async function Page({ searchParams }: { searchParams: Promise<ProductReportFilters> }) {
  const session = await requireRouteAccess("/reports"), raw = await searchParams;
  let data: Awaited<ReturnType<typeof getProductReport>>;
  try { data = await getProductReport(session, raw); }
  catch (error) { return <AppShell active="/reports" title="Аналитика товаров"><p role="alert" className="notice error">{error instanceof Error ? error.message : "Отчёт недоступен."}</p><Link href="/reports/products">Сбросить фильтры</Link></AppShell>; }
  const options = await financeFilterOptions(session, "REPORT_FINANCE_VIEW");
  const filters = new URLSearchParams({ from: data.period.fromLabel, until: data.period.untilLabel, type: data.type, group: data.group, sort: data.sort, q: data.search, ...(raw.branchId ? { branchId: raw.branchId } : {}) });
  const pageHref = (page: number) => { const next = new URLSearchParams(filters); next.set("page", String(page)); return `/reports/products?${next}`; };
  const sourceHref = (row: typeof data.rows[number]) => { const params = new URLSearchParams({ from: data.period.fromLabel, until: data.period.untilLabel, type: data.movementType, ...(data.search ? { reportSearch: data.search } : {}), ...(data.group === "model" ? { productId: row.productId } : { variantId: row.id }), ...(raw.branchId ? { branch: raw.branchId } : {}) }); return `/warehouse/movements?${params}`; };
  const reportQuery = new URLSearchParams({ from: data.period.fromLabel, until: data.period.untilLabel, ...(raw.branchId ? { branchId: raw.branchId } : {}) });
  return <AppShell active="/reports" title="Аналитика товаров" subtitle="Фактические выдачи по моделям и размерам; денежные проводки отдельно">
    <Link href={`/reports?${reportQuery}`}>Все отчёты CRM</Link>
    <form method="get" className="card form-grid product-report-filters">
      <label>С даты UTC<input name="from" type="date" required defaultValue={data.period.fromLabel}/></label>
      <label>По дату UTC включительно<input name="until" type="date" required defaultValue={data.period.untilLabel}/></label>
      <label>Филиал<select name="branchId" defaultValue={raw.branchId ?? ""}><option value="">Все доступные</option>{options.branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Операции<select name="type" defaultValue={data.type}><option value="RENTAL">Аренда</option><option value="SALE">Продажи</option></select></label>
      <label>Группировка<select name="group" defaultValue={data.group}><option value="size">Модель / исполнение / размер</option><option value="model">Модель, все размеры</option></select></label>
      <label>Сортировка<select name="sort" defaultValue={data.sort}><option value="quantity">Больше выданных единиц</option><option value="movements">Больше записей выдачи</option><option value="name">Название</option></select></label>
      <label>Найти товар или размер<input name="q" maxLength={100} defaultValue={data.search}/></label><button className="primary">Показать</button>
    </form>
    <section className="card product-report-table"><h2>{data.type === "SALE" ? "Передано покупателям" : "Выдано в аренду"}</h2>
      <p>Дата фактического движения склада, не дата создания заказа. Брони и черновики не включены. Записи движения — не число уникальных заказов. Это валовые выдачи; возвраты не вычитаются.</p>
      {!data.canInventory ? <p>Нет права на складские показатели.</p> : <><p>{data.total} позиций · {data.totals.quantity} выданных единиц · {data.totals.movements} записей выдачи по выбранному поиску.</p>
        {data.rows.length ? <div className="warehouse-table-wrap"><table className="warehouse-table"><thead><tr>{["Модель", "Исполнение / размер", "Выдано, шт.", "Записей выдачи", "Источник"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.id}>
          <td data-label="Модель">{data.canCatalog ? <Link href={`/products/${row.productId}`}>{row.name}</Link> : row.name}</td><td data-label="Исполнение / размер">{row.execution}<small>{row.size} · {row.sku}</small></td><td data-label="Выдано, шт.">{row.quantity}</td><td data-label="Записей выдачи">{row.movements}</td><td data-label="Источник"><Link href={sourceHref(row)}>Движения за период</Link></td>
        </tr>)}</tbody></table></div> : <p>Фактических выдач по выбранным условиям нет.</p>}
        <nav className="toolbar" aria-label="Страницы аналитики">{data.page > 1 && <Link href={pageHref(data.page - 1)}>Назад</Link>}<span>Страница {data.page} из {data.pages}</span>{data.page < data.pages && <Link href={pageHref(data.page + 1)}>Далее</Link>}</nav>
      </>}
    </section>
    <section className="card"><h2>Финансы всех {data.type === "SALE" ? "продаж" : "аренд"} выбранного периода</h2><p>По дате проводки, выбранным филиалам и валютам. Поиск товара и группировка размеров на этот блок не влияют. Используются существующие эффекты проводок, включая корректировки; залог не является выручкой.</p>
      {!data.canMoney ? <p>Нет права на денежные показатели.</p> : data.money.length ? data.money.map(row => <div key={row.currency} className="card"><h3>{row.currency} · {row.count} проводок</h3>{row.revenueEffectMinor !== undefined && <p>Начисленная выручка: {money(row.revenueEffectMinor, row.currency)}</p>}{row.cashEffectMinor !== undefined && <p>Денежный поток: {money(row.cashEffectMinor, row.currency)}</p>}{row.depositEffectMinor !== undefined && <p>Изменение залогов: {money(row.depositEffectMinor, row.currency)}</p>}{row.obligationEffectMinor !== undefined && <p>Изменение долга: {money(row.obligationEffectMinor, row.currency)}</p>}</div>) : <p>Разрешённых проводок по этому типу заказов за период нет.</p>}
      <p>Деньги по отдельному товару недоступны: платежи и общие скидки относятся к заказу; подтверждённого распределения по позициям нет.</p><Link href={`/reports?${reportQuery}`}>Сводка и исходный финансовый журнал</Link>
    </section>
    <section className="card"><h2>Загрузка и простой: недоступны</h2><p>Нет подтверждённой истории полного парка для расчёта знаменателя. Сегодняшние остатки не подставляются в прошлые периоды. Проценты и дни простоя не рассчитываются.</p></section>
  </AppShell>;
}
