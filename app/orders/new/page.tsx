import { AppShell } from "@/components/AppShell";
import { OrderForm } from "@/components/OrderForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { getOrderFormOptions } from "@/lib/orders/queries";
import { createTenantContext } from "@/lib/tenant/context";
import { createOrderAction } from "../actions";

export default async function NewOrder({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireRouteAccess("/orders"), params = await searchParams;
  const options = await getOrderFormOptions(createTenantContext(session.organizationId));
  return <AppShell active="/orders" title="Новый заказ" subtitle="Клиент, период, товары и итог — в одном мобильном потоке">
    {params.error && <p className="notice error">{params.error}</p>}
    <OrderForm action={createOrderAction} options={options}/>
  </AppShell>;
}
