import { requirePermission } from "@/lib/permissions/effective";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
import { getCustomerOrderHistory } from "@/lib/customers/queries";
import { createTenantContext } from "@/lib/tenant/context";
import { orderStatusLabel, orderTypeLabel } from "@/lib/ui/labels";

export default async function CustomerOrders({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{page?:string;type?:string}>}){
  const session=await requireRouteAccess("/customers"),{id}=await params,{page,type:rawType}=await searchParams;
  await requirePermission(session,"CUSTOMER_VIEW");await requirePermission(session,"ORDER_VIEW");
  const type=rawType==="RENTAL"||rawType==="SALE"?rawType:undefined;
  const parsed=Number(page),pageNumber=Number.isSafeInteger(parsed)&&parsed>0?parsed:1;
  const data=await getCustomerOrderHistory(createTenantContext(session.organizationId),id,session.hasOrganizationWideBranchAccess?null:session.allowedBranchIds,pageNumber,type);
  if(!data)notFound();
  const name=[data.customer.firstName,data.customer.lastName].filter(Boolean).join(" ");
  return <AppShell active="/customers" title={`Заказы · ${name}`} subtitle={`${data.customer.customerNumber} · ${data.total} заказов`} action={<Link className="secondary button-link" href={`/customers/${id}`}>К клиенту</Link>}>
    <nav className="toolbar" aria-label="Тип заказов"><Link href="?">Все</Link><Link href="?type=RENTAL">Аренды</Link><Link href="?type=SALE">Покупки</Link></nav>
    <section className="card customer-order-history">
      {data.orders.map(order=><Link className="customer-history-row" href={`/orders/${order.id}`} key={order.id}>
        <div><strong>{order.orderNumber}</strong><small>{orderTypeLabel(order.type)} · {orderStatusLabel(order.status)}</small></div>
        <div><span>{order.branch.name}</span><small>{order.rentalStartAt?formatBusinessDateTime(order.rentalStartAt,order.branch.timezone):"—"} — {order.rentalEndAt?formatBusinessDateTime(order.rentalEndAt,order.branch.timezone):"—"}</small></div>
        <b>{order.totalMinor.toLocaleString("ru-KZ")} {order.currency==="KZT"?"₸":order.currency}</b>
      </Link>)}
      {!data.orders.length&&<p>У клиента пока нет заказов в доступных филиалах.</p>}
    </section>
    {data.pageCount>1&&<nav className="customer-history-pagination" aria-label="Страницы заказов">
      {data.page>1?<Link className="secondary button-link" href={`?page=${data.page-1}${type?`&type=${type}`:""}`}>← Назад</Link>:<span/>}
      <span>Страница {data.page} из {data.pageCount}</span>
      {data.page<data.pageCount?<Link className="secondary button-link" href={`?page=${data.page+1}${type?`&type=${type}`:""}`}>Далее →</Link>:<span/>}
    </nav>}
  </AppShell>;
}
