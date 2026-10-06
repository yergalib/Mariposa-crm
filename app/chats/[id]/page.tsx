import {updateInquirySelectionAction} from "@/app/workspace/actions";
import {ConversionForm} from "@/components/ConversionForm";
import {workflowOptions} from "@/lib/workspace/conversion";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { getInquiry, inquiryHistory, inquiriesNotInstalled, inquiryOptions } from "@/lib/inquiries/service";
import { SOURCE_LABELS, STATUS_LABELS } from "@/lib/inquiries/validation";
import { formatBusinessDateTime, formatBusinessLocalDateTimeInput } from "@/lib/calendar/timezone";
import { InquiryForm } from "../InquiryForm";
import "../chats.css";

export default async function InquiryCard({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<{error?:string;q?:string}> }) {
  const session = await requireRouteAccess("/chats"), { id } = await params;
  const query=await searchParams;
  let inquiry;
  try { inquiry = await getInquiry(session, id); }
  catch (error) {
    if (!inquiriesNotInstalled(error)) throw error;
    return <AppShell active="/chats" title="Обращение"><p className="card">Очередь пока не включена. Требуется согласованное обновление базы данных.</p></AppShell>;
  }
  if (!inquiry) notFound();
  const history=await inquiryHistory(session,id);
  const [canEdit, canAssign, canClose] = await Promise.all((["LEAD_EDIT", "LEAD_ASSIGN", "LEAD_CLOSE"] as const).map(key => hasPermission(session, key)));
  const options = canEdit ? await inquiryOptions(session, inquiry.branchId, query.q??"", true) : null;
  const selectionOptions=new Map((options?.variants??[]).map(v=>[v.id,v.label]));for(const item of inquiry.items)if(!selectionOptions.has(item.productVariantId))selectionOptions.set(item.productVariantId,`${item.nameSnapshot} · ${item.sizeSnapshot} · ${item.skuSnapshot}`);
  const local = (value: Date | null) => value ? formatBusinessLocalDateTimeInput(value, inquiry.branch.timezone) : "";
  const display = (value: Date | null) => value ? formatBusinessDateTime(value, inquiry.branch.timezone) : "Не указано";
  return <AppShell active="/chats" title={inquiry.subject} subtitle={`${SOURCE_LABELS[inquiry.source]} · ${inquiry.branch.name} · ${STATUS_LABELS[inquiry.status]}`}>
    {query.error&&<p className="notice error">{query.error}</p>}
    {await hasPermission(session,"FITTING_MANAGE")&&inquiry.status!=="CLOSED"&&<Link className="primary-button" href={`/fittings/new?inquiryId=${id}`}>Записать на примерку</Link>}
    <div className="inquiry-queue"><section className="card inquiry-card"><Link href="/chats">← К очереди</Link>
      <p>Обращение не является заказом или бронью. Наличие и цена требуют отдельной проверки.</p>
      <p>Обратный контакт: {inquiry.replyContact ?? "Не указан"}</p>
      <p>Клиент: {inquiry.customerLabel ?? "Не указан"}</p><p>{inquiry.requestText ?? "Описание не указано"}</p>
      <p>Период: {display(inquiry.requestedFrom)} — {display(inquiry.requestedUntil)} ({inquiry.branch.timezone})</p>
      <p>Размер: {inquiry.requestedSize ?? "Не указан"}</p>
      <p>Ответственный: {inquiry.assignedTo?.user.displayName ?? "Не назначен"}{inquiry.assignedTo?.status !== "ACTIVE" && inquiry.assignedTo ? " (неактивен)" : ""}</p>
      <p>Следующее действие: {inquiry.nextAction ?? "Не указано"} · Срок: {display(inquiry.nextActionAt)}</p>
      <h2>Выбранные товары</h2>{inquiry.items.length ? <ul>{inquiry.items.map(item => <li key={item.id}>{item.nameSnapshot} · {item.sizeSnapshot} · {item.skuSnapshot}</li>)}</ul> : <p>Пока не выбраны.</p>}
      <p>Подбор можно обновить до создания заказа. После конверсии товары изменяются в карточке заказа.</p>
      <Link href="/whatsapp">Проверить наличие для ответа</Link>
    </section>
    {canEdit && options && <section className="card"><h2>Обработка обращения</h2>
      <InquiryForm key={inquiry.version} id={id} branchId={inquiry.branchId} timezone={inquiry.branch.timezone} version={inquiry.version}
        canAssign={canAssign} canClose={canClose} assignees={options.assignees}
        initial={{ subject: inquiry.subject, customerLabel: inquiry.customerLabel ?? "", replyContact: inquiry.replyContact ?? "", requestText: inquiry.requestText ?? "", requestedSize: inquiry.requestedSize ?? "",
          requestedFrom: local(inquiry.requestedFrom), requestedUntil: local(inquiry.requestedUntil), status: inquiry.status,
          assignedMembershipId: inquiry.assignedMembershipId ?? "", nextAction: inquiry.nextAction ?? "", nextActionAt: local(inquiry.nextActionAt) }} />
    </section>}
    </div>
    {canEdit&&!inquiry.orderId&&await hasPermission(session,"CATALOG_VIEW")&&<section className="card"><h2>Подбор товаров</h2><form><label>Поиск товара<input name="q" defaultValue={query.q}/></label><button>Найти</button></form><form action={updateInquirySelectionAction}><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={inquiry.version}/><select name="variantIds" multiple size={8} defaultValue={inquiry.items.map(item=>item.productVariantId)}>{[...selectionOptions].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button className="secondary">Сохранить подбор</button></form></section>}
    {await hasPermission(session,"LEAD_CONVERT_TO_ORDER")&&await hasPermission(session,"ORDER_CREATE")&&<><form><label>Поиск клиента<input name="q" defaultValue={query.q}/></label><button>Найти</button></form><ConversionForm source="INQUIRY" sourceId={id} orderId={inquiry.orderId} initial={{customerId:inquiry.customerId,customerLabel:inquiry.customerLabel,requestedFrom:inquiry.requestedFrom,requestedUntil:inquiry.requestedUntil}} options={await workflowOptions(session,"ORDER_VIEW",inquiry.branchId,query.q)} actorId={session.membershipId}/></>}
    <section className="card"><h2>История обращения</h2><p>Последние 100 событий. Подробности назначения и срока доступны для новых изменений; прежняя история не восстанавливается задним числом.</p>{history.map(entry=>{const m=entry.metadata as Record<string,unknown>|null;const status=(value:unknown)=>typeof value==="string"?STATUS_LABELS[value as keyof typeof STATUS_LABELS]??value:"—";const when=(value:unknown)=>typeof value==="string"&&!Number.isNaN(new Date(value).getTime())?formatBusinessDateTime(new Date(value),inquiry.branch.timezone):"Не указан";return <article key={entry.id}><p>{formatBusinessDateTime(entry.occurredAt,inquiry.branch.timezone)} · {entry.actorUser?.displayName??"Система"} · {({INQUIRY_CREATED:"Создано",INQUIRY_UPDATED:"Изменено",INQUIRY_SELECTION_UPDATED:"Обновлён подбор",SOURCE_CONVERTED_TO_ORDER:"Создан заказ",INQUIRY_FITTING_CREATED:"Создана примерка"} as Record<string,string>)[entry.action]??"Изменение обращения"}</p>{m?.status!==undefined&&<p>Статус: {m.previousStatus!==undefined&&`${status(m.previousStatus)} → `}{status(m.status)}</p>}{m?.assignedMembershipId!==undefined&&<p>Ответственный: {entry.previousAssignee} → {entry.assignee}</p>}{m?.nextActionAt!==undefined&&<p>Срок: {when(m.previousNextActionAt)} → {when(m.nextActionAt)}</p>}{m?.nextActionChanged===true&&<p>Изменено следующее действие.</p>}{m?.detailsChanged===true&&<p>Обновлены поля обращения. Содержимое контактов и текста не копируется в аудит.</p>}</article>})}</section>

  </AppShell>;
}
