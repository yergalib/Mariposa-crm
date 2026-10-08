import { compactReference } from "@/lib/ui/reference";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { getEffectivePermissions, requirePermission } from "@/lib/permissions/effective";
import { getCustomers } from "@/lib/customers/queries";
import { createTenantContext } from "@/lib/tenant/context";
import { SOURCES } from "@/lib/customers/validation";

const statusLabels:Record<string,string>={ACTIVE:"Активен",BLOCKED:"Заблокирован",ARCHIVED:"В архиве"};
const sourceLabels:Record<string,string>={CRM:"В магазине",PHONE:"Телефон",WHATSAPP:"WhatsApp",INSTAGRAM:"Instagram",WEBSITE:"Сайт",OTHER:"Другое",REFERRAL:"Рекомендация"};
type Query={q?:string;status?:"ACTIVE"|"BLOCKED"|"ARCHIVED"|"";source?:string;page?:string;ok?:string;error?:string};
function pageHref(query:Query,page:number){const params=new URLSearchParams();if(query.q)params.set("q",query.q);if(query.status!==undefined)params.set("status",query.status);if(query.source)params.set("source",query.source);params.set("page",String(page));return `/customers?${params}`;}

export default async function Customers({searchParams}:{searchParams:Promise<Query>}){
  const session=await requireRouteAccess("/customers");await requirePermission(session,"CUSTOMER_VIEW");const query=await searchParams;
  const parsed=Number(query.page),page=Number.isSafeInteger(parsed)&&parsed>0?parsed:1;
  const status=query.status===""||query.status==="ACTIVE"||query.status==="BLOCKED"||query.status==="ARCHIVED"?query.status:undefined;
  const source=query.source&&SOURCES.includes(query.source as typeof SOURCES[number])?query.source:undefined;
  const filters={...query,status,source};
  const [data,permissions]=await Promise.all([getCustomers(createTenantContext(session.organizationId),{search:query.q,status,source,page}),getEffectivePermissions(session)]);
  const create=permissions.has("CUSTOMER_CREATE"),imp=permissions.has("CUSTOMER_IMPORT"),exp=permissions.has("CUSTOMER_EXPORT");
  const exportParams=new URLSearchParams();if(query.q)exportParams.set("q",query.q);if(status!==undefined)exportParams.set("status",status);if(source)exportParams.set("source",source);
  return <AppShell active="/customers" title="Клиенты" subtitle={`Контакты и история отношений · ${data.total} найдено`} action={create||imp||exp?<div className="top-actions">{exp&&<a className="secondary button-link" href={`/customers/export?${exportParams}`}>↓ Excel</a>}{imp&&<Link className="secondary button-link" href="/customers/import">Импорт</Link>}{create&&<Link className="primary button-link" href="/customers/new">＋ Новый клиент</Link>}</div>:undefined}>
    {query.ok&&<p className="notice ok">{query.ok}</p>}{query.error&&<p className="notice error">{query.error}</p>}
    <form method="get" className="toolbar customer-toolbar"><input name="q" defaultValue={query.q} placeholder="Имя, номер, телефон или email"/><select name="status" defaultValue={status??"ACTIVE"}><option value="">Все статусы</option><option value="ACTIVE">Активные</option><option value="BLOCKED">Заблокированные</option><option value="ARCHIVED">Архив</option></select><select name="source" defaultValue={source??""}><option value="">Все источники</option>{SOURCES.map(x=><option key={x} value={x}>{sourceLabels[x]??x}</option>)}</select><button className="secondary">Найти</button></form>
    <section className="card customer-list"><div className="customer-list-heading"><span>Номер</span><span>Клиент / телефон</span><span>Email</span><span>Источник</span><span>Статус</span><span>Создан</span></div>{data.rows.length?data.rows.map(customer=>{const phone=customer.contacts.find(x=>x.type==="PHONE"),email=customer.contacts.find(x=>x.type==="EMAIL");return <Link href={`/customers/${customer.id}`} className="customer-row" key={customer.id}><b>{compactReference(customer.customerNumber)}</b><span><strong>{[customer.firstName,customer.lastName,customer.middleName].filter(Boolean).join(" ")}</strong><small>{phone?.value??"Телефон не указан"}</small></span><span>{email?.value??"—"}</span><span>{sourceLabels[customer.source??"OTHER"]??customer.source}</span><span>{statusLabels[customer.status]??customer.status}</span><time>{customer.createdAt.toLocaleDateString("ru-KZ")}</time></Link>}):<p className="customer-empty">Клиенты не найдены.</p>}</section>
    {data.pageCount>1&&<nav className="customer-history-pagination" aria-label="Страницы клиентов">
      {data.page>1?<Link className="secondary button-link" href={pageHref(filters,data.page-1)}>← Назад</Link>:<span/>}
      <span>Страница {data.page} из {data.pageCount}</span>
      {data.page<data.pageCount?<Link className="secondary button-link" href={pageHref(filters,data.page+1)}>Далее →</Link>:<span/>}
    </nav>}
  </AppShell>;
}
