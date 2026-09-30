import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmptyState, StatusChip } from "@/components/ui";
import { requireRouteAccess } from "@/lib/auth/session";
import { getOrderPaymentListDetails } from "@/lib/finance/queries";
import { getOrders } from "@/lib/orders/queries";
import { getEffectivePermissions } from "@/lib/permissions/effective";
import { createTenantContext } from "@/lib/tenant/context";
import { orderStatusLabel, orderStatusTone } from "@/lib/ui/labels";

const money=(value:bigint,currency:string)=>`${value.toLocaleString("ru-KZ")} ${currency==="KZT"?"₸":currency}`;
const customerName=(order:{customer:{firstName:string;lastName:string|null}})=>[order.customer.firstName,order.customer.lastName].filter(Boolean).join(" ");

export default async function Sales(){
  const session=await requireRouteAccess("/sales"),tenant=createTenantContext(session.organizationId),permissions=await getEffectivePermissions(session);
  const canAccess=permissions.has("SALE_CONFIRM")||permissions.has("SALE_FULFILL");
  if(!canAccess)notFound();
  const rows=await getOrders(tenant,{type:"SALE"},{allowedBranchIds:session.hasOrganizationWideBranchAccess?null:session.allowedBranchIds});
  const payments=permissions.has("PAYMENT_VIEW")?await getOrderPaymentListDetails(tenant,rows,session):new Map();
  const canCreate=permissions.has("ORDER_CREATE")&&permissions.has("SALE_CONFIRM");
  const canExport=permissions.has("ORDER_EXPORT");
  return <AppShell active="/sales" title="Продажи" subtitle={`${rows.length} ${rows.length===1?"продажа":"продаж"}`} action={canCreate||canExport?<div className="order-create-actions">{canExport&&<Link className="secondary button-link" href="/orders/export?type=SALE">↓ Excel продаж</Link>}{canCreate&&<Link className="primary button-link" href="/sales/new">+ Новая продажа</Link>}</div>:undefined}>
    <div className="orders-table ui-card"><div className="orders-table-head"><span>Продажа и клиент</span><span>Создана</span><span>Филиал</span><span>Позиции</span><span>Сумма</span><span>Статус</span></div>{rows.map(order=>{const payment=payments.get(order.id);return <Link href={`/orders/${order.id}`} className="orders-table-row" key={order.id}><span className="order-identity"><b>{order.orderNumber}</b><strong>{customerName(order)}</strong><small>{order.customer.contacts[0]?.value??"Телефон не указан"}</small></span><span>{order.createdAt.toLocaleString("ru-KZ")}</span><span>{order.branch.name}</span><span>{order._count.items} поз.</span><span><b>{money(order.totalMinor,order.currency)}</b>{payment&&<small>{payment.status==="NOT_ACCRUED"?"Начисление не создано":payment.status==="NOT_REQUIRED"?"Оплата не требуется":payment.status==="PAID"?"Оплачено":payment.status==="OVERPAID"?"Переплата":`Долг ${money(payment.outstandingMinor,order.currency)}`}</small>}</span><StatusChip tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</StatusChip></Link>})}{!rows.length&&<EmptyState title="Продаж пока нет" description={canCreate?"Создайте первую продажу.":"Доступные продажи появятся здесь."}/>}</div>
  </AppShell>;
}
