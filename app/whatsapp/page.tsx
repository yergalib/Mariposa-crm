import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { getInquiryBranches, lookupRentalInquiry } from "@/lib/whatsapp/inquiry";
import { CopyInquiryReply } from "./CopyInquiryReply";
import "./whatsapp.css";

type Query={branchId?:string;q?:string;size?:string;from?:string;until?:string};
const value=(raw:string|string[]|undefined)=>typeof raw==="string"?raw:undefined;
function reply(item:Awaited<ReturnType<typeof lookupRentalInquiry>>[number],from:string,until:string){
  const local=(value:string)=>`${value.slice(8,10)}.${value.slice(5,7)}.${value.slice(0,4)} ${value.slice(11,16)}`;
  const model=`${item.name}${item.execution?` (${item.execution})`:""}`,period=`с ${local(from)} до ${local(until)}`;
  if(item.available<1)return `Здравствуйте! ${model}, размер ${item.size}, на период ${period} сейчас недоступен. Можем подобрать другую модель или даты.`;
  const price=item.price?` Стоимость аренды — ${item.price.amountMinor.toLocaleString("ru-KZ")} ${item.price.currency}.`:" Стоимость аренды уточним перед оформлением.";
  return `Здравствуйте! ${model}, размер ${item.size}, на период ${period} сейчас доступен.${price} Наличие подтвердим при оформлении брони.`;
}
export default async function WhatsAppAssistant({searchParams}:{searchParams:Promise<Record<keyof Query,string|string[]|undefined>>}){
  const session=await requireRouteAccess("/whatsapp"),raw=await searchParams,tenant=createTenantContext(session.organizationId);
  const query:Query={branchId:value(raw.branchId),q:value(raw.q),size:value(raw.size),from:value(raw.from),until:value(raw.until)};
  const branches=await getInquiryBranches(tenant,session.hasOrganizationWideBranchAccess?null:session.allowedBranchIds);
  const branch=query.branchId?branches.find(row=>row.id===query.branchId):branches.find(row=>row.id===session.defaultBranchId)??branches[0];
  let results:Awaited<ReturnType<typeof lookupRentalInquiry>>|null=null,error="";
  if(query.from||query.until||query.q||query.size){
    if(!branch||!query.from||!query.until)error="Выберите филиал и обе даты периода.";
    else try{results=await lookupRentalInquiry(tenant,session.membershipId,{branchId:branch.id,search:query.q??"",size:query.size??"",from:query.from,until:query.until});}
    catch(e){if(e instanceof RangeError||e instanceof Error&&e.message==="Филиал недоступен.")error=e.message;else throw e;}
  }
  return <AppShell active="/whatsapp" title="Помощник переписки" subtitle="Проверка наличия по данным CRM перед ответом клиенту">
    <Link href="/chats">← К очереди обращений</Link>
    <section className="card inquiry-intro"><h2>Наличие для клиента</h2><p>Введите модель или размер и период аренды. Результат учитывает брони, выдачи, обслуживание и буфер между арендами. Наличие может измениться до подтверждения заказа.</p></section>
    <form method="get" className="card inquiry-form">
      <label>Филиал<select name="branchId" defaultValue={branch?.id??""} required>{branches.map(row=><option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
      <label>Модель, код или название<input name="q" maxLength={100} defaultValue={query.q??""} placeholder="Например, Белоснежка"/></label>
      <label>Размер<input name="size" maxLength={30} defaultValue={query.size??""} placeholder="Например, 110"/></label>
      <label>Начало аренды<input name="from" type="datetime-local" defaultValue={query.from??""} required/></label>
      <label>Конец аренды<input name="until" type="datetime-local" defaultValue={query.until??""} required/></label>
      <button className="primary">Проверить</button>
    </form>
    {error&&<p className="notice error">{error}</p>}
    {results&&<section className="inquiry-results"><h2>Найдено вариантов: {results.length}</h2>{results.length===8&&<p>Показаны первые 8 вариантов. Уточните модель или размер для полного результата.</p>}
      {results.map(item=><article className="card inquiry-result" key={item.id}>
        {item.imageUrl&&<img src={item.imageUrl} alt={item.name}/>}
        <div><Link href={`/products/${item.productId}`}><strong>{item.name}{item.execution?` · ${item.execution}`:""}</strong></Link><span>Размер {item.size} · SKU {item.sku}</span><span>{item.price?`Аренда: ${item.price.amountMinor.toLocaleString("ru-KZ")} ${item.price.currency}`:"Цена аренды не внесена в CRM"}</span><b className={item.available>0?"available":"unavailable"}>{item.available>0?`Свободно на выбранный период: ${item.available}`:"На выбранный период свободных нет"}</b><CopyInquiryReply text={reply(item,query.from!,query.until!)}/></div>
      </article>)}
      {!results.length&&<p className="card inquiry-empty">Подходящих моделей не найдено. Попробуйте другое название или размер.</p>}
    </section>}
    <section className="card inquiry-intro"><h2>Подключение чатов</h2><p>Проверка работает внутри CRM. Получение сообщений, автоматические ответы и предварительные брони будут подключены отдельным этапом.</p></section>
  </AppShell>;
}
