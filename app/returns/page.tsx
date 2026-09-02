import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { canPerformFulfillmentAction } from "@/lib/auth/access";
import { requireRouteAccess } from "@/lib/auth/session";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import { lookupCurrentRentalByBarcode } from "@/lib/fulfillment/returns";
import { createTenantContext } from "@/lib/tenant/context";
import { receiveReturnAction } from "@/app/orders/actions";

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ barcode?: string; ok?: string; error?: string }> }) {
  const session = await requireRouteAccess("/returns"), query = await searchParams, barcode = query.barcode?.trim() ?? "";
  let rental: Awaited<ReturnType<typeof lookupCurrentRentalByBarcode>> | null = null, lookupError: string | null = null;
  if (barcode) try { rental = await lookupCurrentRentalByBarcode(createTenantContext(session.organizationId), barcode); } catch (error) { lookupError = error instanceof FulfillmentError ? error.message : "Не удалось найти аренду."; }
  const canReturn = canPerformFulfillmentAction(session.role, "RECEIVE_RETURN");
  return <AppShell active="/returns" title="Возвраты" subtitle="Сканирование и приём физического экземпляра">
    {query.ok && <p className="notice ok">{query.ok}</p>}{(query.error || lookupError) && <p className="notice error">{query.error || lookupError}</p>}
    <form className="card return-lookup"><label>Штрихкод возвращаемого экземпляра<input name="barcode" defaultValue={barcode} autoFocus autoComplete="off" enterKeyHint="search" required placeholder="Сканируйте или введите штрихкод"/></label><button className="primary">Найти аренду</button></form>
    {rental && <section className="card return-result"><div className="section-heading"><div><h2>{rental.instance.productVariant.product.name} · {rental.instance.productVariant.size.name || rental.instance.productVariant.size.code}</h2><p>{rental.instance.inventoryNumber} · {rental.instance.barcode}</p></div>{rental.overdue && <span className="status cancelled">ПРОСРОЧЕНО</span>}</div><dl><div><dt>Заказ</dt><dd><Link href={`/orders/${rental.order.id}`}>{rental.order.orderNumber}</Link></dd></div><div><dt>Клиент</dt><dd>{[rental.order.customer.firstName, rental.order.customer.lastName].filter(Boolean).join(" ")}</dd></div><div><dt>Филиал</dt><dd>{rental.order.branch.name}</dd></div><div><dt>Плановый возврат</dt><dd>{rental.order.rentalEndAt?.toLocaleString("ru-KZ")}</dd></div><div><dt>Выдан</dt><dd>{rental.allocation.issuedAt?.toLocaleString("ru-KZ")}</dd></div></dl>{canReturn ? <form action={receiveReturnAction} className="return-process"><input type="hidden" name="orderId" value={rental.order.id}/><input type="hidden" name="returnTo" value="/returns"/><input type="hidden" name="barcode" value={rental.instance.barcode}/><label>Результат осмотра<select name="inspectionResult" defaultValue="GOOD" required><option value="GOOD">Хорошее состояние</option><option value="NEEDS_CLEANING">Нужна чистка</option><option value="DAMAGED">Повреждение</option></select></label><label>Комментарий<input name="conditionNote" placeholder="Например: пятно на подоле"/></label><button className="primary">Принять возврат</button></form> : <p>Ваша роль имеет доступ только для просмотра.</p>}</section>}
  </AppShell>;
}
