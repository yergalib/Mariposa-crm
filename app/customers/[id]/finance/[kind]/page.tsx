import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
import { getCustomerFinancialHistory } from "@/lib/finance/queries";
import { createTenantContext } from "@/lib/tenant/context";

export default async function CustomerFinance({params,searchParams}:{params:Promise<{id:string;kind:string}>;searchParams:Promise<{page?:string}>}){
  const session=await requireRouteAccess("/customers"),{id,kind}=await params,{page}=await searchParams;
  if(kind!=="payments"&&kind!=="deposits")notFound();
  const parsed=Number(page),pageNumber=Number.isSafeInteger(parsed)&&parsed>0?parsed:1;
  const data=await getCustomerFinancialHistory(createTenantContext(session.organizationId),id,session,kind,pageNumber);
  if(!data)notFound();
  const title=kind==="payments"?"Платежи и возвраты":"Залоги";
  const name=[data.customer.firstName,data.customer.lastName].filter(Boolean).join(" ");
  return <AppShell active="/customers" title={`${title} · ${name}`} subtitle={`${data.customer.customerNumber} · ${data.total} операций`} action={<Link className="secondary button-link" href={`/customers/${id}`}>К клиенту</Link>}>
    <section className="card customer-payments">
      {data.rows.map(row=>{
        const original=row.kind==="REVERSAL"?row.reversalOf?.kind:row.kind;
        const label=kind==="payments"
          ?row.kind==="REVERSAL"?(original==="PAYMENT_RECEIVED"?"Отмена оплаты":"Отмена возврата"):(row.kind==="CUSTOMER_REFUND"?"Возврат клиенту":"Получена оплата")
          :row.kind==="REVERSAL"?(original==="DEPOSIT_RECEIVED"?"Отмена приёма залога":original==="DEPOSIT_REFUNDED"?"Отмена возврата залога":"Отмена удержания"):(row.kind==="DEPOSIT_RECEIVED"?"Залог принят":row.kind==="DEPOSIT_REFUNDED"?"Залог возвращён":"Удержано из залога");
        const amount=kind==="payments"?row.cashEffectMinor:row.depositEffectMinor;
        return <div className="customer-payment-row" key={row.id}><div><strong>{label}</strong><small>{formatBusinessDateTime(row.occurredAt,row.branch.timezone)} · {row.branch.name}{row.paymentMethod?` · ${row.paymentMethod.displayName}`:""}</small>{row.order&&<Link href={`/orders/${row.order.id}`}>{row.order.orderNumber} →</Link>}</div><b>{amount>BigInt(0)?"+":""}{amount.toLocaleString("ru-KZ")} {row.currency==="KZT"?"₸":row.currency}</b></div>;
      })}
      {!data.rows.length&&<p>Операций в доступных филиалах пока нет.</p>}
    </section>
    {data.pageCount>1&&<nav className="customer-history-pagination" aria-label="Страницы операций">
      {data.page>1?<Link className="secondary button-link" href={`?page=${data.page-1}`}>← Назад</Link>:<span/>}
      <span>Страница {data.page} из {data.pageCount}</span>
      {data.page<data.pageCount?<Link className="secondary button-link" href={`?page=${data.page+1}`}>Далее →</Link>:<span/>}
    </nav>}
  </AppShell>;
}
