import { AppShell } from "@/components/AppShell";
import { OrderForm } from "@/components/OrderForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { getAvailabilityForForm, getOrderFormOptions } from "@/lib/orders/queries";
import { createOrderAction } from "../actions";

type Params = { error?: string; q?: string; branchId?: string; variantId?: string; from?: string; until?: string; quantity?: string };
export default async function New({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireRouteAccess("/orders"), params = await searchParams, tenant = createTenantContext(session.organizationId);
  const options = await getOrderFormOptions(tenant, params.q);
  let availability: Awaited<ReturnType<typeof getAvailabilityForForm>> | null = null, availabilityError = "";
  if (params.branchId && params.variantId && params.from && params.until) try {
    availability = await getAvailabilityForForm(tenant, { branchId: params.branchId, variantId: params.variantId, from: new Date(params.from), until: new Date(params.until), quantity: Number(params.quantity || 1) });
  } catch { availabilityError = "Не удалось рассчитать доступность. Проверьте филиал, вариант и даты."; }
  return <AppShell active="/orders" title="Новый заказ" subtitle="Черновик аренды без блокировки capacity">{params.error && <p className="notice error">{params.error}</p>}<form className="availability-check card" method="get"><h2>Проверить доступность</h2><input name="q" defaultValue={params.q} placeholder="Поиск товара, размера или SKU"/><select name="branchId" required defaultValue={params.branchId}><option value="">Филиал</option>{options.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><select name="variantId" required defaultValue={params.variantId}><option value="">Товар / размер</option>{options.variants.map(v=><option key={v.id} value={v.id}>{v.product.name} · {v.size.name||v.size.code} · {v.sku}</option>)}</select><input name="from" type="datetime-local" required defaultValue={params.from}/><input name="until" type="datetime-local" required defaultValue={params.until}/><input name="quantity" type="number" min="1" required defaultValue={params.quantity||"1"}/><button className="secondary">Рассчитать</button>{availability&&<p className={availability.canFulfill?"notice ok":"notice error"}>Доступно: <b>{availability.availableCapacity} из {availability.totalCapacity}</b>. Запрошено: {availability.requestedQuantity}. {availability.canFulfill?"Можно забронировать.":"Capacity недостаточно."}</p>}{availabilityError&&<p className="notice error">{availabilityError}</p>}</form><OrderForm action={createOrderAction} options={options}/></AppShell>;
}
