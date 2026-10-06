import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { WarehouseStockTable } from "@/components/WarehouseStockTable";
import { requireRouteAccess } from "@/lib/auth/session";
import { getInventoryItems, INVENTORY_STATUSES, parseInventoryStatus } from "@/lib/inventory/queries";
import { CONDITION_LABELS, INSTANCE_STATUS_LABELS } from "@/lib/inventory/labels";
import { createTenantContext } from "@/lib/tenant/context";
import { getWarehouseSummary, parseBulkStockFilter } from "@/lib/inventory/warehouse-summary";
import { parseInventoryArchive } from "@/lib/inventory/archive-filter";
import { OperationalItemSelector } from "@/components/OperationalItemSelector";
import { hasPermission, requirePermission } from "@/lib/permissions/effective";

export type InventorySearchParams = Promise<{ q?: string | string[]; status?: string | string[]; bulkStock?: string | string[]; bulkPage?: string | string[]; archive?: string | string[] }>;
function parameter(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }

export async function InventoryView({ searchParams }: { searchParams: InventorySearchParams }) {
  const session = await requireRouteAccess("/warehouse");
  await requirePermission(session, "INVENTORY_VIEW");
  const params = await searchParams;
  const search = parameter(params.q)?.trim() ?? "";
  const status = parseInventoryStatus(parameter(params.status));
  const bulkStock = parseBulkStockFilter(parameter(params.bulkStock));
  const archive = parseInventoryArchive(parameter(params.archive));
  const tenant = createTenantContext(session.organizationId);
  const allowedBranchIds = session.hasOrganizationWideBranchAccess ? null : session.allowedBranchIds;
  const [canExport, items, summary] = await Promise.all([
    hasPermission(session, "INVENTORY_EXPORT"),
    getInventoryItems({ tenant, search, status, allowedBranchIds, archive }),
    getWarehouseSummary(tenant, allowedBranchIds, { search, stock: bulkStock, page: parameter(params.bulkPage), archive }),
  ]);
  const exportParams = new URLSearchParams();
  if (search) exportParams.set("q", search);
  if (status) exportParams.set("status", status);
  const bulkPageHref = (page: number) => {
    const next = new URLSearchParams(exportParams);
    next.set("bulkStock", bulkStock); next.set("bulkPage", String(page)); next.set("archive", archive);
    return `/warehouse?${next}`;
  };
  return <AppShell active="/warehouse" title="Склад" subtitle="Количество и состояние товаров по филиалам">
    <section className="card operational-scan-entry"><div><h2>Найти на складе</h2><p>Сканируйте код товара для просмотра количества и состояния.</p></div><OperationalItemSelector purpose="WAREHOUSE_LOOKUP" triggerLabel="Сканировать на складе" prompt="Сканируйте товар для просмотра"/></section>
    <form className="toolbar inventory-toolbar warehouse-filters" method="get">
      <label>Товар или код<input name="q" defaultValue={search} placeholder="Название, код или штрихкод"/></label>
      <label>Каталог<select name="archive" defaultValue={archive}><option value="current">Текущий каталог</option><option value="archived">Архив</option></select></label>
      <label>Остаток на складе<select name="bulkStock" defaultValue={bulkStock}><option value="all">Все, включая нулевые</option><option value="positive">Больше нуля</option><option value="zero">Только нулевые</option></select></label>
      <label>Статус индивидуального экземпляра<select name="status" defaultValue={status ?? ""}><option value="">Все статусы</option>{INVENTORY_STATUSES.map(value => <option value={value} key={value}>{INSTANCE_STATUS_LABELS[value]}</option>)}</select></label>
      <button className="secondary" type="submit">Найти</button>
      <Link className="button secondary" href="/warehouse/movements">История движений</Link>
      <Link className="button" href="/warehouse/operations">Складская операция</Link>
      <Link className="button secondary" href="/warehouse/stocktakes">Инвентаризации</Link>
      {canExport && <a className="button secondary" href={`/warehouse/export?${exportParams}`}>↓ Excel остатков</a>}
    </form>
    {archive === "archived" && <p className="notice">Архив: сохранённые товары и история. Эти количества не добавляются к текущему каталогу.</p>}
    <section className="card warehouse-stock-card">
      <div className="card-head"><div><h2>{archive === "archived" ? "Архивные количественные остатки" : "Количественные остатки"}</h2>
        <p>Найдено {summary.total} позиций · показано {summary.first}–{summary.last} · на складе {summary.units} ед.</p>
        <p>Одна строка — вариант товара в филиале. «Всего» = на складе + в аренде. Чистка и ремонт входят в складской остаток; резерв не прибавляется к нему.</p>
        <p>Резерв аренды показан на текущий момент. Свободное количество на нужные даты проверяется при оформлении заказа.</p>
      </div></div>
      {summary.bulk.length ? <WarehouseStockTable rows={summary.bulk}/> : <div className="inventory-empty">Товары по выбранным условиям не найдены.</div>}
      <nav className="toolbar" aria-label="Страницы количественных остатков">
        {summary.page > 1 && <Link className="button secondary" href={bulkPageHref(summary.page - 1)}>← Назад</Link>}
        <span>Страница {summary.page} из {summary.pages}</span>
        {summary.page < summary.pages && <Link className="button secondary" href={bulkPageHref(summary.page + 1)}>Далее →</Link>}
      </nav>
      {canExport && <p>Excel содержит все количественные остатки доступных филиалов, включая архив. Поиск и статус применяются в нём только к индивидуальным экземплярам.</p>}
    </section>
    <section className="card inventory-card"><div className="card-head"><div><h2>{archive === "archived" ? "Архивные индивидуальные экземпляры" : "Индивидуальные экземпляры"}</h2><p>{items.length} найдено · максимум 250 за один запрос</p></div></div>
      {!items.length ? <div className="inventory-empty">Экземпляры по выбранным условиям не найдены.{archive === "current" && " Исторические экземпляры доступны в фильтре «Архив»."}</div> : <div className="warehouse-table-wrap"><table className="warehouse-table warehouse-instance-table">
        <thead><tr>{["Экземпляр", "Товар / Название", "Статус", "Состояние", "Филиал / Место"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{items.map(item => <tr key={item.id}>
          <td data-label="Экземпляр">{item.inventoryNumber}<small>Штрихкод: {item.barcode}</small></td>
          <td data-label="Товар / Название" className="warehouse-name"><Link href={`/products/${item.productId}`}><strong>{item.productName}</strong></Link><small>Размер: {item.size} · Код: {item.sku}</small></td>
          <td data-label="Статус">{INSTANCE_STATUS_LABELS[item.operationalStatus]}</td>
          <td data-label="Состояние">{CONDITION_LABELS[item.conditionStatus] ?? "Не уточнено"}</td>
          <td data-label="Филиал / Место" className="warehouse-branch">{item.branchName}<small>{item.locationName}</small></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </AppShell>;
}
