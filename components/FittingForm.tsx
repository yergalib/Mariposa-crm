import {randomUUID} from "node:crypto";
import {formatBusinessLocalDateTimeInput} from "@/lib/calendar/timezone";
import {FITTING_STATUS_LABELS} from "@/lib/fittings/validation";
import type {workflowOptions} from "@/lib/workspace/conversion";
import type {getFitting} from "@/lib/fittings/service";
import {SOURCE_LABELS} from "@/lib/inquiries/validation";
type Options=Awaited<ReturnType<typeof workflowOptions>>;
export function FittingForm({action,options,row,actorId,inquiry}:{action:(form:FormData)=>Promise<void>;options:Options;row?:NonNullable<Awaited<ReturnType<typeof getFitting>>>;actorId:string;inquiry?:{id:string;customerLabel:string|null;replyContact:string|null;source:keyof typeof SOURCE_LABELS;items:{productVariantId:string;nameSnapshot:string;sizeSnapshot:string;skuSnapshot:string}[]}}){
 const variants=new Map(options.variants.map(v=>[v.id,{id:v.id,label:`${v.product.name} · ${v.execution?.name??""} ${v.size.name} · ${v.sku}`} ]));for(const item of row?.items??inquiry?.items??[])if(!variants.has(item.productVariantId))variants.set(item.productVariantId,{id:item.productVariantId,label:`${item.nameSnapshot} · ${item.sizeSnapshot} · ${item.skuSnapshot}`});
 const selected=(row?.items??inquiry?.items??[]).map(item=>item.productVariantId);
 const customer=row?.customer,customers=options.customers.map(c=>({id:c.id,label:`${c.firstName} ${c.lastName??""} · ${c.customerNumber}`}));if(customer&&!customers.some(c=>c.id===customer.id))customers.push({id:customer.id,label:`${customer.firstName} ${customer.lastName??""}`});
 return <form action={action} className="panel form-grid"><input type="hidden" name="id" value={row?.id??""}/><input type="hidden" name="version" value={row?.version??1}/><input type="hidden" name="creationKey" value={randomUUID()}/><input type="hidden" name="branchId" value={row?.branchId??options.branch?.id??""}/><input type="hidden" name="inquiryId" value={row?.inquiryId??inquiry?.id??""}/>
 <p>Филиал: {options.branch?.name}. Примерка длится 30 минут и не резервирует товар.</p>
 <label>Клиент<select name="customerId" defaultValue={row?.customerId??""}><option value="">Гость без карточки клиента</option>{customers.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
 <label>Имя гостя<input name="guestName" maxLength={120} defaultValue={row?.guestName??inquiry?.customerLabel??""}/></label><label>Контакт гостя<input name="guestContact" maxLength={254} defaultValue={row?.guestContact??inquiry?.replyContact??""}/></label>
 <label>Начало ({options.branch?.timezone})<input type="datetime-local" name="startsAt" required defaultValue={row?formatBusinessLocalDateTimeInput(row.startsAt,row.branch.timezone):""}/></label><label>Сотрудник<select name="assignedMembershipId" required defaultValue={row?.assignedMembershipId??actorId}>{options.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
 <label>Источник<select name="source" defaultValue={row?.source??inquiry?.source??"CRM"}>{Object.entries(SOURCE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
 {row&&<label>Статус<select name="status" defaultValue={row.status}>{Object.entries(FITTING_STATUS_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}
 <label>Подобранные товары<select name="variantIds" multiple size={8} defaultValue={selected}>{[...variants.values()].map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label><label>Комментарий<textarea name="comment" maxLength={2000} defaultValue={row?.comment??""}/></label><button className="primary">{row?"Сохранить примерку":"Записать на примерку"}</button>
 </form>;
}
