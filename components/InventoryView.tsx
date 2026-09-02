import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { getInventoryItems, INVENTORY_STATUSES, parseInventoryStatus } from "@/lib/inventory/queries";
import { CONDITION_LABELS, INSTANCE_STATUS_LABELS } from "@/lib/inventory/labels";
import { createTenantContext } from "@/lib/tenant/context";
import { getWarehouseSummary } from "@/lib/inventory/movements";

type InventorySearchParams = Promise<{
  q?: string | string[];
  status?: string | string[];
}>;

function parameter(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export async function InventoryView({ searchParams }: { searchParams: InventorySearchParams }) {
  const session = await requireRouteAccess("/warehouse");
  const params = await searchParams;
  const search = parameter(params.q)?.trim() ?? "";
  const statusValue = parameter(params.status) ?? "";
  const status = parseInventoryStatus(statusValue);
  const tenant = createTenantContext(session.organizationId);
  const items = await getInventoryItems({
    tenant,
    search,
    status
  });
  const summary = await getWarehouseSummary(tenant);

  return (
    <AppShell active="/warehouse" title="Склад" subtitle="Физические экземпляры и их текущее местонахождение">
      <form className="toolbar inventory-toolbar" method="get">
        <input name="q" defaultValue={search} placeholder="Inventory number, штрихкод, товар или SKU" />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">Все физические статусы</option>
          {INVENTORY_STATUSES.map((itemStatus) => (
            <option value={itemStatus} key={itemStatus}>{INSTANCE_STATUS_LABELS[itemStatus]}</option>
          ))}
        </select>
        <button className="secondary" type="submit">Найти</button>
        <Link className="button secondary" href="/warehouse/movements">История движений</Link>
        <Link className="button" href="/warehouse/operations">Складская операция</Link>
        <Link className="button secondary" href="/warehouse/stocktakes">Инвентаризации</Link>
      </form>

      <section className="card"><div className="card-head"><div><h2>BULK остатки</h2><p>Физическое количество по филиалам и местам хранения</p></div></div>{summary.bulk.length===0?<div className="inventory-empty">BULK остатки отсутствуют.</div>:<div className="inventory-table">{summary.bulk.map(level=><div className="inventory-row" key={level.id}><div><strong>{level.productVariant.product.name}</strong><small>{level.productVariant.size.code} · {level.productVariant.sku}</small></div><strong>{level.quantity}</strong><div>{level.branch.name}</div><div>{level.location?.name??"Без зоны"}</div><span>ON_HAND</span></div>)}</div>}</section>

      <section className="card inventory-card">
        <div className="card-head">
          <div><h2>Экземпляры</h2><p>{items.length} найдено · максимум 250 за один запрос</p></div>
        </div>
        {items.length === 0 ? (
          <div className="inventory-empty">Экземпляры по выбранным условиям не найдены.</div>
        ) : (
          <div className="inventory-table">
            <div className="inventory-row inventory-header">
              <span>Экземпляр</span><span>Товар</span><span>Статус</span><span>Состояние</span><span>Местонахождение</span>
            </div>
            {items.map((item) => (
              <div className="inventory-row" key={item.id}>
                <div><strong>{item.inventoryNumber}</strong><small>Штрихкод {item.barcode}</small></div>
                <div><Link href={`/products/${item.productId}`}><strong>{item.productName}</strong></Link><small>Размер {item.size} · SKU {item.sku}</small></div>
                <span><em className={`badge ${item.operationalStatus.toLowerCase()}`}>{INSTANCE_STATUS_LABELS[item.operationalStatus]}</em></span>
                <span>{CONDITION_LABELS[item.conditionStatus] ?? item.conditionStatus}</span>
                <div><strong>{item.branchName}</strong><small>{item.locationName}</small></div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
