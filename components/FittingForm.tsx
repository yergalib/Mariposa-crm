"use client";
import {useActionState,useState} from "react";
import type {FittingFormState} from "@/app/fittings/actions";
import {formatBusinessLocalDateTimeInput} from "@/lib/calendar/timezone";
import {FITTING_STATUS_LABELS} from "@/lib/fittings/validation";
import type {workflowOptions} from "@/lib/workspace/conversion";
import type {getFitting} from "@/lib/fittings/service";
import {SOURCE_LABELS} from "@/lib/inquiries/validation";
type Options=Awaited<ReturnType<typeof workflowOptions>>;
export function FittingForm({action,options,row,actorId,inquiry,creationKey}:{action:(state:FittingFormState,form:FormData)=>Promise<FittingFormState>;creationKey:string;options:Options;row?:NonNullable<Awaited<ReturnType<typeof getFitting>>>;actorId:string;inquiry?:{id:string;customerLabel:string|null;replyContact:string|null;source:keyof typeof SOURCE_LABELS;items:{productVariantId:string;nameSnapshot:string;sizeSnapshot:string;skuSnapshot:string}[]}}){
 const variants=new Map(options.variants.map(v=>[v.id,{id:v.id,label:`${v.product.name} · ${v.execution?.name?`${v.execution.name} · `:""}размер ${v.size.name} · арт. ${v.sku}`} ]));for(const item of row?.items??inquiry?.items??[])if(!variants.has(item.productVariantId))variants.set(item.productVariantId,{id:item.productVariantId,label:`${item.nameSnapshot} · размер ${item.sizeSnapshot} · арт. ${item.skuSnapshot}`});
 const timezone=options.branch?.timezone??"UTC",offset=new Intl.DateTimeFormat("en",{timeZone:timezone,timeZoneName:"shortOffset"}).formatToParts(row?.startsAt??new Date()).find(part=>part.type==="timeZoneName")?.value.replace("GMT","UTC");
 const [selected,setSelected]=useState<string[]>((row?.items??inquiry?.items??[]).map(item=>item.productVariantId));
 const [stableCreationKey]=useState(creationKey);
 const [values,setValues]=useState({customerId:row?.customerId??"",guestName:row?.guestName??inquiry?.customerLabel??"",guestContact:row?.guestContact??inquiry?.replyContact??"",startsAt:row?formatBusinessLocalDateTimeInput(row.startsAt,row.branch.timezone):"",assignedMembershipId:row?.assignedMembershipId??actorId,source:row?.source??inquiry?.source??"CRM",status:row?.status??"SCHEDULED",comment:row?.comment??""});
 const change=(key:keyof typeof values,value:string)=>setValues(previous=>({...previous,[key]:value}));
 const [state,submit,pending]=useActionState(action,{error:null});
 const customer=row?.customer,customers=options.customers.map(c=>({id:c.id,label:`${c.firstName} ${c.lastName??""} · ${c.customerNumber}`}));if(customer&&!customers.some(c=>c.id===customer.id))customers.push({id:customer.id,label:`${customer.firstName} ${customer.lastName??""}`});
 // React form actions reset native selects/checkboxes even when an action returns a validation error.
 // Success redirects; failures keep this draft, including its controlled selections.
 return <form onReset={event=>event.preventDefault()} action={submit} aria-busy={pending} className="panel form-grid fitting-form"><input type="hidden" name="id" value={row?.id??""}/><input type="hidden" name="version" value={row?.version??1}/><input type="hidden" name="creationKey" value={stableCreationKey}/><input type="hidden" name="branchId" value={row?.branchId??options.branch?.id??""}/><input type="hidden" name="inquiryId" value={row?.inquiryId??inquiry?.id??""}/>
 {state.error&&<p role="alert" className="notice error fitting-form-summary">{state.error}</p>}
 <p className="fitting-form-summary">Филиал: {options.branch?.name}. Примерка длится 30 минут и не резервирует товар.</p>
 <label>Клиент<select name="customerId" value={values.customerId} onChange={event=>change("customerId",event.target.value)}><option value="">Гость без карточки клиента</option>{customers.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
 <label>Имя гостя<input name="guestName" maxLength={120} value={values.guestName} onChange={event=>change("guestName",event.target.value)}/></label><label>Контакт гостя<input name="guestContact" maxLength={254} value={values.guestContact} onChange={event=>change("guestContact",event.target.value)}/></label>
 <label>Начало — время филиала<input type="datetime-local" name="startsAt" required aria-describedby="fitting-timezone" value={values.startsAt} onChange={event=>change("startsAt",event.target.value)}/><small id="fitting-timezone">{options.branch?.name}: {timezone} ({offset}). Вводите местное время этого филиала.</small></label><label>Сотрудник<select name="assignedMembershipId" required value={values.assignedMembershipId} onChange={event=>change("assignedMembershipId",event.target.value)}>{options.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
 <label>Источник<select name="source" value={values.source} onChange={event=>change("source",event.target.value)}>{Object.entries(SOURCE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
 {row&&<label>Статус<select name="status" value={values.status} onChange={event=>change("status",event.target.value)}>{Object.entries(FITTING_STATUS_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}
 <fieldset className="fitting-products"><legend>Подобранные товары</legend><p>Отметьте нужные товары и размеры. Можно выбрать несколько.</p>{options.variants.length>=50&&<p>Показаны первые 50 результатов. Уточните поиск по названию или артикулу выше.</p>}<div className="fitting-product-options">{[...variants.values()].map(v=><label key={v.id}><input type="checkbox" name="variantIds" value={v.id} checked={selected.includes(v.id)} onChange={event=>setSelected(previous=>event.target.checked?[...previous,v.id]:previous.filter(id=>id!==v.id))}/><span>{v.label}</span></label>)}{variants.size===0&&<p>Товары не найдены. Измените поиск выше.</p>}</div></fieldset><label>Комментарий<textarea name="comment" maxLength={2000} value={values.comment} onChange={event=>change("comment",event.target.value)}/></label><button className="primary" disabled={pending}>{row?"Сохранить примерку":"Записать на примерку"}</button>
 </form>;
}
