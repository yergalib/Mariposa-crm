import { hasPermission } from "@/lib/permissions/effective";
import { AppShell } from "@/components/AppShell";
import { SaleOrderForm } from "@/components/SaleOrderForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { getOrderFormOptions } from "@/lib/orders/queries";
import { requirePermission } from "@/lib/permissions/effective";
import { createTenantContext } from "@/lib/tenant/context";
import { createConfirmedSaleAction } from "../actions";

export default async function NewSale({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireRouteAccess("/sales/new");
  await requirePermission(session, "ORDER_CREATE");
  await requirePermission(session, "SALE_CONFIRM");
  const params = await searchParams;
  const options = await getOrderFormOptions(createTenantContext(session.organizationId));
  return <AppShell active="/sales" title="Новая продажа" subtitle="Клиент, товары, итог и подтверждение">
    {params.error && <p className="notice error">{params.error}</p>}
    <SaleOrderForm canOverridePrice={await hasPermission(session,"ORDER_PRICE_OVERRIDE")} canDiscount={await hasPermission(session,"ORDER_DISCOUNT_MANAGE")} action={createConfirmedSaleAction} branches={options.branches} creationKey={`sale-create:${randomUUID()}`}/>
  </AppShell>;
}
import { randomUUID } from "node:crypto";
