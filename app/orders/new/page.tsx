import { AppShell } from "@/components/AppShell";
import { OrderForm } from "@/components/OrderForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { getAvailabilityForForm, getOrderFormOptions } from "@/lib/orders/queries";
import { resolveInventoryScan } from "@/lib/inventory/scan";
import { createOrderAction } from "../actions";

type Params = { error?: string; q?: string; scan?: string; branchId?: string; variantId?: string; from?: string; until?: string; quantity?: string };
export default async function New({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireRouteAccess("/orders"), params = await searchParams, tenant = createTenantContext(session.organizationId);
  let scanResult: Awaited<ReturnType<typeof resolveInventoryScan>> = null, scanError = "";
  if (params.scan) try {
    scanResult = await resolveInventoryScan(tenant, params.scan, session, params.branchId || undefined);
    if (!scanResult) scanError = "Код не найден.";
  } catch { scanError = "Код не найден или недоступен."; }
  const options = await getOrderFormOptions(tenant, params.q);
  if (params.scan && scanResult && !options.variants.some((variant) => variant.id === scanResult?.variantId)) {
    const scannedOptions = await getOrderFormOptions(tenant, params.scan);
    const scannedVariant = scannedOptions.variants.find((variant) => variant.id === scanResult?.variantId);
    if (scannedVariant) options.variants.unshift(scannedVariant);
  }
  const selectedVariantId = scanResult?.variantId ?? params.variantId;
  let availability: Awaited<ReturnType<typeof getAvailabilityForForm>> | null = null, availabilityError = "";
  if (params.branchId && selectedVariantId && params.from && params.until) try {
    availability = await getAvailabilityForForm(tenant, { branchId: params.branchId, variantId: selectedVariantId, from: new Date(params.from), until: new Date(params.until), quantity: Number(params.quantity || 1) });
  } catch { availabilityError = "Не удалось рассчитать доступность. Проверьте филиал, вариант и даты."; }
  return <AppShell active="/orders" title="Новый заказ" subtitle="Найдите клиента и товар, проверьте период и оформите заказ">
    {params.error && <p className="notice error">{params.error}</p>}
    <form className="card inline-form scan-lookup" method="get"><label>Быстрый поиск по SKU или штрихкоду<input name="scan" defaultValue={params.scan} autoComplete="off" placeholder="Например, 0060.120"/></label>{params.branchId&&<input type="hidden" name="branchId" value={params.branchId}/>}<button className="secondary">Найти</button></form>
    {scanError&&<p className="notice error">{scanError}</p>}{scanResult&&<p className="notice ok">Найдено: <b>{scanResult.productName} · {scanResult.size}</b> · {scanResult.kind==="BULK_VARIANT"?`общий SKU ${scanResult.sku}`:`экземпляр ${scanResult.inventoryNumber}`}</p>}
    <details className="availability-panel card" open={Boolean(availability||availabilityError)}><summary>Проверить доступность на выбранные даты</summary><form className="availability-check" method="get"><input name="q" defaultValue={params.q} placeholder="Товар, код, размер или SKU"/><select name="branchId" required defaultValue={params.branchId}><option value="">Филиал</option>{options.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><select name="variantId" required defaultValue={selectedVariantId}><option value="">Товар / размер</option>{options.variants.map(v=><option key={v.id} value={v.id}>{v.product.name} · {v.execution?`${v.execution.name} · `:""}{v.size.name||v.size.code} · {v.sku}</option>)}</select><input name="from" type="datetime-local" required defaultValue={params.from}/><input name="until" type="datetime-local" required defaultValue={params.until}/><input name="quantity" type="number" min="1" required defaultValue={params.quantity||"1"}/><button className="secondary">Проверить</button>{availability&&<p className={availability.canFulfill?"notice ok":"notice error"}>Доступно: <b>{availability.availableCapacity} из {availability.totalCapacity}</b>. Нужно: {availability.requestedQuantity}. {availability.canFulfill?"Можно добавить в заказ.":"На выбранные даты количества недостаточно."}</p>}{availabilityError&&<p className="notice error">{availabilityError}</p>}</form></details>
    <OrderForm action={createOrderAction} options={options} defaultVariantId={selectedVariantId}/>
  </AppShell>;
}
