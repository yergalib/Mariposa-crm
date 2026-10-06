import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { hasPermission } from "@/lib/permissions/effective";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import { lookupCurrentRentalByBarcode } from "@/lib/fulfillment/returns";
import { getOutstandingBulkRentalsForVariant, resolveInventoryScan } from "@/lib/inventory/scan";
import { createTenantContext } from "@/lib/tenant/context";
import { requireBranchAccess } from "@/lib/staff/branch-access";
import { OperationalItemSelector } from "@/components/OperationalItemSelector";

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ barcode?: string; ok?: string; error?: string }> }) {
  const session = await requireRouteAccess("/returns");await requirePermission(session,"ORDER_VIEW");const  query = await searchParams, barcode = query.barcode?.trim() ?? "", tenant = createTenantContext(session.organizationId);
  let rental: Awaited<ReturnType<typeof lookupCurrentRentalByBarcode>> | null = null;
  let bulkRows: Awaited<ReturnType<typeof getOutstandingBulkRentalsForVariant>> = [];
  let scan: Awaited<ReturnType<typeof resolveInventoryScan>> = null, lookupError: string | null = null;
  if (barcode) try {
    scan = await resolveInventoryScan(tenant, barcode, session, undefined, "RETURN_RECEIVE");
    if (!scan) throw new FulfillmentError("NOT_FOUND", "Код не найден.");
    if (scan.kind === "BULK_VARIANT") bulkRows = await getOutstandingBulkRentalsForVariant(tenant, scan.variantId, session);
    else { rental = await lookupCurrentRentalByBarcode(tenant, scan.barcode); await requireBranchAccess(tenant,session.membershipId,rental.order.branchId); }
  } catch (error) { rental=null; scan=null; lookupError = error instanceof FulfillmentError ? error.message : "Аренда не найдена или недоступна."; }
  const canReturn = await hasPermission(session, "RETURN_PROCESS");
  return <AppShell active="/returns" title="Возвраты" subtitle="Сканирование общего SKU или физического экземпляра">
    {query.ok && <p className="notice ok">{query.ok}</p>}{(query.error || lookupError) && <p className="notice error">{query.error || lookupError}</p>}
    <section className="card operational-scan-entry"><div><h2>Сканировать возврат</h2><p>Сканируйте товар, который вернул клиент. Принятие выполняется отдельно в заказе.</p></div><OperationalItemSelector purpose="RETURN_RECEIVE" triggerLabel="Сканировать возврат" prompt="Сканируйте товар, который вернул клиент"/></section>
    <form className="card return-lookup"><label>SKU варианта или штрихкод экземпляра<input name="barcode" defaultValue={barcode} autoComplete="off" enterKeyHint="search" required placeholder="Введите код вручную"/></label><button className="primary">Найти</button></form>
    {scan?.kind==="BULK_VARIANT"&&<section className="card return-result"><h2>{scan.productName} · {scan.size}</h2><p>Общий SKU {scan.sku}. Выберите заказ; количества и состояние указываются на общем экране приёма.</p>{bulkRows.length?<div className="order-list">{bulkRows.map(row=><Link className="order-row" href={`/returns/${row.orderId}?allocation=${encodeURIComponent(row.allocationId)}`} key={row.allocationId}><b>{row.orderNumber}</b><span>{row.customerName}</span><span>{row.branchName}</span><span>Не возвращено: {row.outstanding}</span><strong>Продолжить возврат</strong></Link>)}</div>:<p className="notice">По доступным филиалам нет невозвращённого количества.</p>}</section>}
    {rental && <section className="card return-result"><div className="section-heading"><div><h2>{rental.instance.productVariant.product.name} · {rental.instance.productVariant.size.name || rental.instance.productVariant.size.code}</h2><p>{rental.instance.inventoryNumber} · {rental.instance.barcode}</p></div>{rental.overdue && <span className="status cancelled">ПРОСРОЧЕНО</span>}</div><dl><div><dt>Заказ</dt><dd>{rental.order.orderNumber}</dd></div><div><dt>Клиент</dt><dd>{[rental.order.customer.firstName, rental.order.customer.lastName].filter(Boolean).join(" ")}</dd></div><div><dt>Филиал</dt><dd>{rental.order.branch.name}</dd></div><div><dt>Плановый возврат</dt><dd>{rental.order.rentalEndAt?formatBusinessDateTime(rental.order.rentalEndAt,rental.order.branch.timezone):"—"}</dd></div><div><dt>Выдан</dt><dd>{rental.allocation.issuedAt?.toLocaleString("ru-KZ")}</dd></div></dl>{canReturn?<Link className="primary" href={`/returns/${rental.order.id}?allocation=${encodeURIComponent(rental.allocation.id)}&barcode=${encodeURIComponent(rental.instance.barcode)}`}>Продолжить возврат</Link>:<p>Ваша роль имеет доступ только для просмотра.</p>}</section>}
  </AppShell>;
}
