import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/permissions/effective";
import { getCustomers } from "@/lib/customers/queries";
import { createTenantContext } from "@/lib/tenant/context";
import { SOURCES } from "@/lib/customers/validation";

type Query={q?:string;status?:"ACTIVE"|"BLOCKED"|"ARCHIVED"|"";source?:string;page?:string;ok?:string;error?:string};
function pageHref(query:Query,page:number){const params=new URLSearchParams();if(query.q)params.set("q",query.q);if(query.status!==undefined)params.set("status",query.status);if(query.source)params.set("source",query.source);params.set("page",String(page));return `/customers?${params}`;}

export default async function Customers({searchParams}:{searchParams:Promise<Query>}){
  const session=await requireRouteAccess("/customers"),query=await searchParams;
  const parsed=Number(query.page),page=Number.isSafeInteger(parsed)&&parsed>0?parsed:1;
  const status=query.status===""||query.status==="ACTIVE"||query.status==="BLOCKED"||query.status==="ARCHIVED"?query.status:undefined;
  const source=query.source&&SOURCES.includes(query.source as typeof SOURCES[number])?query.source:undefined;
  const filters={...query,status,source};
  const [data,permissions]=await Promise.all([getCustomers(createTenantContext(session.organizationId),{search:query.q,status,source,page}),getEffectivePermissions(session)]);
  const create=permissions.has("CUSTOMER_CREATE"),imp=permissions.has("CUSTOMER_IMPORT");
  return <AppShell active="/customers" title="Клиенты" subtitle={`Контакты и история отношений · ${data.total} найдено`} action={create||imp?<div className="top-actions">{imp&&<Link className="secondary button-link" href="/customers/import">Импорт</Link>}{create&&<Link className="primary button-link" href="/customers/new">＋ Новый клиент</Link>}</div>:undefined}>
    {query.ok&&<p className="notice ok">{query.ok}</p>}{query.error&&<p className="notice error">{query.error}</p>}
    <form method="get" className="toolbar customer-toolbar"><input name="q" defaultValue={query.q} placeholder="Имя, номер, телефон или email"/><select name="status" defaultValue={status??"ACTIVE"}><option value="">Все статусы</option><option>ACTIVE</option><option>BLOCKED</option><option>ARCHIVED</option></select><select name="source" defaultValue={source??""}><option value="">Все источники</option>{SOURCES.map(x=><option key={x}>{x}</option>)}</select><button className="secondary">Найти</button></form>
    <section className="card customer-list">{data.rows.length?data.rows.map(customer=>{const phone=customer.contacts.find(x=>x.type==="PHONE"),email=customer.contacts.find(x=>x.type==="EMAIL");return <Link href={`/customers/${customer.id}`} className="customer-row" key={customer.id}><b>{customer.customerNumber}</b><span><strong>{[customer.firstName,customer.lastName,customer.middleName].filter(Boolean).join(" ")}</strong><small>{phone?.value??"Телефон не указан"}</small></span><span>{email?.value??"—"}</span><span>{customer.source??"OTHER"}</span><span>{customer.status}</span><time>{customer.createdAt.toLocaleDateString("ru-KZ")}</time></Link>}):<p className="customer-empty">Клиенты не найдены.</p>}</section>
    {data.pageCount>1&&<nav className="customer-history-pagination" aria-label="Страницы клиентов">
      {data.page>1?<Link className="secondary button-link" href={pageHref(filters,data.page-1)}>← Назад</Link>:<span/>}
      <span>Страница {data.page} из {data.pageCount}</span>
      {data.page<data.pageCount?<Link className="secondary button-link" href={pageHref(filters,data.page+1)}>Далее →</Link>:<span/>}
    </nav>}
  </AppShell>;
}
