import { inquirySalePrefill } from "@/lib/workspace/inquiry-sale";
import { getOrderCustomerPrefill } from "@/lib/orders/customer-prefill";
import Link from "next/link";
import { hasPermission } from "@/lib/permissions/effective";
import { AppShell } from "@/components/AppShell";
import { SaleOrderForm } from "@/components/SaleOrderForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { getOrderFormOptions } from "@/lib/orders/queries";
import { createTenantContext } from "@/lib/tenant/context";
import { createConfirmedSaleAction } from "../actions";
import { fittingSalePrefill } from "@/lib/workspace/fitting-sale";

export default async function NewSale({ searchParams }: { searchParams: Promise<{ error?: string; customerId?: string; fittingId?: string; inquiryId?: string }> }) {
  const session = await requireRouteAccess("/sales/new");
  if (!await hasPermission(session, "ORDER_CREATE") || !await hasPermission(session, "SALE_CONFIRM")) return <AppShell active="/orders" title="Новая продажа"><p role="alert" className="notice error">Недостаточно прав для создания продажи.</p><Link href="/orders">← К заказам</Link></AppShell>;
  const params = await searchParams;
  if(params.fittingId && params.inquiryId)return <AppShell active="/sales" title="Новая продажа"><p role="alert">Выберите один источник продажи.</p></AppShell>;
  let purchase:Awaited<ReturnType<typeof inquirySalePrefill>>|undefined;
  try{if(params.inquiryId)purchase=await inquirySalePrefill(session,params.inquiryId)}catch{return <AppShell active="/chats" title="Продажа из обращения"><p role="alert">Обращение недоступно или изменилось. Откройте его заново.</p><Link href="/chats">К обращениям</Link></AppShell>}
  if(purchase?.existingOrderId)return <AppShell active="/chats" title="Продажа уже создана"><Link href={`/orders/${purchase.existingOrderId}`}>Открыть связанную продажу</Link><Link href={`/chats/${purchase.inquiry.id}`}>К обращению</Link></AppShell>;
  let prefill: Awaited<ReturnType<typeof fittingSalePrefill>> | undefined;
  try { if(params.fittingId) prefill = await fittingSalePrefill(session, params.fittingId); }
  catch { return <AppShell active="/fittings" title="Продажа после примерки"><p role="alert">Примерка недоступна для создания продажи.</p><Link href="/fittings">К примеркам</Link></AppShell>; }
  if(prefill?.existingOrderId) return <AppShell active="/fittings" title="Заказ уже создан"><Link href={`/orders/${prefill.existingOrderId}`}>Открыть связанный заказ</Link></AppShell>;
  const defaultCustomer = await getOrderCustomerPrefill(session, purchase?.inquiry.customerId ?? prefill?.fitting.customerId ?? params.customerId);
  const options = await getOrderFormOptions(createTenantContext(session.organizationId));
  return <AppShell nextStep="Выберите клиента и товары, затем проверьте итог перед подтверждением." active="/sales" title="Новая продажа" subtitle="Клиент, товары, итог и подтверждение">
    {params.error && <p className="notice error">{params.error}</p>}
    {purchase&&<section className="panel"><Link href={`/chats/${purchase.inquiry.id}`}>← К обращению</Link><p>Покупка из обращения. Товары добавлены по одной штуке; проверьте актуальную цену, клиента и ответственного. Для поэкземплярного товара выберите экземпляр. Переход не создаёт продажу; подтверждение выполняется отдельно.</p>{!defaultCustomer&&<p>Выберите клиента. Контакт из обращения автоматически не копируется.</p>}{purchase.excluded.length>0&&<p role="status">Сейчас недоступны для продажи: {purchase.excluded.join(", ")}.</p>}</section>}
    {prefill&&<section className="panel"><Link href={`/fittings/${prefill.fitting.id}`}>← К примерке</Link><p>Проверьте клиента, позиции, цену и ответственного. Каждая позиция из примерки добавлена в количестве 1; для поэкземплярного товара выберите или отсканируйте экземпляр. Создание продажи — отдельное подтверждение с резервом через существующий SALE-процесс.</p>{!defaultCustomer&&<p>Выберите существующего клиента или создайте его обычным способом. Контакт гостя автоматически не копируется.</p>}{prefill.excluded.length>0&&<p role="status">Не добавлены: {prefill.excluded.join(", ")}. Эти позиции сейчас недоступны для продажи по правилам каталога.</p>}</section>}
    <SaleOrderForm fitting={purchase?{kind:"INQUIRY",version:purchase.inquiry.version,id:purchase.inquiry.id,branchId:purchase.inquiry.branchId,quotes:purchase.quotes,members:purchase.options.members,assignedMembershipId:purchase.assignedMembershipId,source:purchase.inquiry.source==="TELEGRAM"?"OTHER":purchase.inquiry.source}:prefill?{id:prefill.fitting.id,branchId:prefill.fitting.branchId,quotes:prefill.quotes,members:prefill.options.members,assignedMembershipId:prefill.assignedMembershipId,source:prefill.fitting.source==="TELEGRAM"?"OTHER":prefill.fitting.source}:undefined} defaultCustomer={defaultCustomer ?? undefined} canOverridePrice={await hasPermission(session,"ORDER_PRICE_OVERRIDE")} canDiscount={await hasPermission(session,"ORDER_DISCOUNT_MANAGE")} action={createConfirmedSaleAction} branches={options.branches} creationKey={`sale-create:${randomUUID()}`}/>
  </AppShell>;
}
import { randomUUID } from "node:crypto";
