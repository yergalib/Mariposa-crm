import Link from "next/link";
import { hasPermission } from "@/lib/permissions/effective";
import { AppShell } from "@/components/AppShell";
import { SaleOrderForm } from "@/components/SaleOrderForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { getOrderFormOptions } from "@/lib/orders/queries";
import { createTenantContext } from "@/lib/tenant/context";
import { createConfirmedSaleAction } from "../actions";

export default async function NewSale({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireRouteAccess("/sales/new");
  if (!await hasPermission(session, "ORDER_CREATE") || !await hasPermission(session, "SALE_CONFIRM")) return <AppShell active="/orders" title="Новая продажа"><p role="alert" className="notice error">Недостаточно прав для создания продажи.</p><Link href="/orders">← К заказам</Link></AppShell>;
  const params = await searchParams;
  const options = await getOrderFormOptions(createTenantContext(session.organizationId));
  return <AppShell active="/sales" title="Новая продажа" subtitle="Клиент, товары, итог и подтверждение">
    {params.error && <p className="notice error">{params.error}</p>}
    <SaleOrderForm canOverridePrice={await hasPermission(session,"ORDER_PRICE_OVERRIDE")} canDiscount={await hasPermission(session,"ORDER_DISCOUNT_MANAGE")} action={createConfirmedSaleAction} branches={options.branches} creationKey={`sale-create:${randomUUID()}`}/>
  </AppShell>;
}
import { randomUUID } from "node:crypto";
