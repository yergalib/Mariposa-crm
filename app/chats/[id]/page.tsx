import { isPurchaseInquiry } from "@/lib/inquiries/purchase-intent";
import { inquiryConversation } from "@/lib/assistant/history/service";
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
import { RevealSectionLink } from "@/components/RevealSectionLink";
import { ClaimInquiryForm } from "../ClaimInquiryForm";
import { InquiryForm } from "../InquiryForm";
import { InquirySummary, InquiryWorkSummary } from "@/components/InquirySummary";
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
  const conversation=await inquiryConversation(session,id);
  const [canEdit, canAssign, canClose] = await Promise.all((["LEAD_EDIT", "LEAD_ASSIGN", "LEAD_CLOSE"] as const).map(key => hasPermission(session, key)));
  const options = canEdit ? await inquiryOptions(session, inquiry.branchId, query.q??"", true) : null;
  const selectionOptions=new Map((options?.variants??[]).map(v=>[v.id,v.label]));for(const item of inquiry.items)if(!selectionOptions.has(item.productVariantId))selectionOptions.set(item.productVariantId,`${item.nameSnapshot} · ${item.sizeSnapshot} · ${item.skuSnapshot}`);
  const local = (value: Date | null) => value ? formatBusinessLocalDateTimeInput(value, inquiry.branch.timezone) : "";
  const display = (value: Date | null) => value ? formatBusinessDateTime(value, inquiry.branch.timezone) : "Не указано";
  const purchase = isPurchaseInquiry(inquiry);
  const canViewLinkedOrder = purchase && Boolean(inquiry.orderId) && await hasPermission(session,"ORDER_VIEW");
  const canSale = purchase && inquiry.status !== "CLOSED" && !inquiry.orderId && await hasPermission(session,"LEAD_CONVERT_TO_ORDER") && await hasPermission(session,"ORDER_CREATE") && await hasPermission(session,"SALE_CONFIRM");
  const canConvert = !purchase && await hasPermission(session,"LEAD_CONVERT_TO_ORDER") && await hasPermission(session,"ORDER_CREATE");
  const datesUnchanged = [inquiry.requestedFrom,inquiry.requestedUntil,inquiry.nextActionAt].every(value => !value || (value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0));
  const canClaim = datesUnchanged && canEdit && canAssign && inquiry.status === "NEW" && !inquiry.assignedMembershipId && !inquiry.orderId && options?.assignees.some(member => member.id === session.membershipId);
  return <AppShell active="/chats" title="Обращение" subtitle={`${SOURCE_LABELS[inquiry.source]} · ${inquiry.branch.name}`}>
    {query.error&&<p className="notice error">{query.error}</p>}
    <div className="inquiry-queue"><section className="card inquiry-card inquiry-detail-compact"><Link href="/chats">← К очереди</Link>
      <InquirySummary compact {...inquiry} timezone={inquiry.branch.timezone}/>
      <div className="inquiry-primary-action">
        {canClaim && <ClaimInquiryForm id={id} version={inquiry.version} fields={{subject:inquiry.subject,customerLabel:inquiry.customerLabel??"",requestText:inquiry.requestText??"",requestedSize:inquiry.requestedSize??"",requestedFrom:local(inquiry.requestedFrom),requestedUntil:local(inquiry.requestedUntil),nextAction:inquiry.nextAction??"",nextActionAt:local(inquiry.nextActionAt),assignedMembershipId:session.membershipId}}/>}
        {(canConvert || canViewLinkedOrder) && inquiry.orderId ? <Link className="primary button-link" href={`/orders/${inquiry.orderId}`}>Открыть заказ</Link> : !canClaim && <Link className="primary button-link" href="/whatsapp">Проверить наличие</Link>}
      </div>
      <p className="inquiry-booking-note"><strong>{inquiry.orderId ? "Заказ создан — его статус в карточке заказа." : purchase ? "Заявка на покупку. Продажа и оплата ещё не выполнены." : "Заявка, ещё не бронь."}</strong></p>
      <InquiryWorkSummary {...inquiry} timezone={inquiry.branch.timezone}/>
      {inquiry.status === "NEW" && !inquiry.assignedMembershipId && !inquiry.orderId && !canClaim && <div className="inquiry-claim-unavailable"><button className="secondary" disabled aria-describedby="inquiry-claim-unavailable">Взять в работу</button><p id="inquiry-claim-unavailable">{!canEdit || !canAssign ? "Недостаточно прав для назначения." : "Быстрое назначение недоступно. Проверьте данные в редактировании."}</p></div>}
      <dl className="inquiry-request-facts inquiry-request-compact">
        <div><dt>Клиент и контакт</dt><dd>{inquiry.customerLabel ?? "Имя не указано"}<span>{inquiry.replyContact ?? "Контакт не указан — уточните у клиента"}</span></dd></div>
        <div><dt>Товар · размер</dt><dd>{inquiry.items.length ? inquiry.items.map(item => <span key={item.id}>{item.nameSnapshot} · {item.sizeSnapshot}</span>) : inquiry.subject}{inquiry.requestedSize && <small>Запрошен размер: {inquiry.requestedSize}</small>}</dd></div>
        {purchase ? <div><dt>Тип обращения</dt><dd>Покупка · без дат аренды</dd></div> : <div><dt>Желаемый период · время филиала</dt><dd>{display(inquiry.requestedFrom)} — {display(inquiry.requestedUntil)}</dd></div>}
      </dl>
      <div className="inquiry-actions inquiry-secondary-actions">
        {canSale && <Link className="secondary button-link" href={`/sales/new?inquiryId=${id}`}>Оформить продажу</Link>}
        {(canClaim || inquiry.orderId) && <Link className="secondary button-link" href="/whatsapp">Проверить наличие</Link>}
        {canConvert && !inquiry.orderId && <RevealSectionLink target="inquiry-order">Оформить заказ</RevealSectionLink>}
        {await hasPermission(session,"FITTING_MANAGE") && inquiry.status!=="CLOSED" && <Link className="secondary button-link" href={`/fittings/new?inquiryId=${id}`}>Записать на примерку</Link>}
      </div>
      {purchase && <p>Товары и филиал будут перенесены в форму продажи. Проверьте клиента, актуальную цену и наличие. Продажа и связь с обращением создаются только после отдельного подтверждения.</p>}
      {inquiry.requestText && <section className="inquiry-client-request"><h2>Запрос клиента</h2><p>{inquiry.requestText}</p></section>}
      <details><summary>Тема и коды товаров</summary><p>{inquiry.subject}</p>{inquiry.items.map(item => <p key={item.id}>{item.nameSnapshot} · {item.sizeSnapshot} · {item.skuSnapshot}</p>)}</details>
      {conversation && <section aria-label="Переданная переписка"><h2>Переписка с сайта</h2><p>Передана клиентом. Цены и наличие в прежних ответах не являются подтверждением; проверьте их в CRM. История доступна до {display(conversation.expiresAt)}.</p>{conversation.messages.map((message,index)=><article key={index}><strong>{message.role === "user" ? "Клиент" : "Предыдущий ответ помощника"}</strong><p style={{whiteSpace:"pre-wrap"}}>{message.content}</p></article>)}</section>}
    </section>
    {canEdit && options && <details className="card inquiry-edit-disclosure"><summary>Изменить статус, ответственного или следующий шаг</summary>
      <InquiryForm key={inquiry.version} id={id} branchId={inquiry.branchId} timezone={inquiry.branch.timezone} version={inquiry.version}
        canAssign={canAssign} canClose={canClose} assignees={options.assignees}
        initial={{ subject: inquiry.subject, customerLabel: inquiry.customerLabel ?? "", replyContact: inquiry.replyContact ?? "", requestText: inquiry.requestText ?? "", requestedSize: inquiry.requestedSize ?? "",
          requestedFrom: local(inquiry.requestedFrom), requestedUntil: local(inquiry.requestedUntil), status: inquiry.status,
          assignedMembershipId: inquiry.assignedMembershipId ?? "", nextAction: inquiry.nextAction ?? "", nextActionAt: local(inquiry.nextActionAt) }} />
    </details>}
    </div>
    {canEdit&&!inquiry.orderId&&await hasPermission(session,"CATALOG_VIEW")&&<details className="card"><summary>Изменить подбор товаров</summary><form><label>Поиск товара<input name="q" defaultValue={query.q}/></label><button>Найти</button></form><form action={updateInquirySelectionAction}><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={inquiry.version}/><select name="variantIds" multiple size={8} defaultValue={inquiry.items.map(item=>item.productVariantId)}>{[...selectionOptions].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button className="secondary">Сохранить подбор</button></form></details>}
    {canConvert&&<details id="inquiry-order" className="card inquiry-conversion"><summary>{inquiry.orderId ? "Созданный заказ" : "Оформление заказа"}</summary><form><label>Поиск клиента<input name="q" defaultValue={query.q}/></label><button>Найти</button></form><ConversionForm source="INQUIRY" sourceId={id} orderId={inquiry.orderId} initial={{assignedMembershipId:inquiry.assignedMembershipId,customerId:inquiry.customerId,customerLabel:inquiry.customerLabel,requestedFrom:inquiry.requestedFrom,requestedUntil:inquiry.requestedUntil}} options={await workflowOptions(session,"ORDER_VIEW",inquiry.branchId,query.q)} actorId={session.membershipId}/></details>}
    <section className="card"><h2>История обращения</h2><details><summary>Что входит в историю</summary><p>Последние 100 событий. Подробности назначения и срока доступны для новых изменений; прежняя история не восстанавливается задним числом.</p></details>{history.map(entry=>{const m=entry.metadata as Record<string,unknown>|null;const status=(value:unknown)=>typeof value==="string"?STATUS_LABELS[value as keyof typeof STATUS_LABELS]??value:"—";const when=(value:unknown)=>typeof value==="string"&&!Number.isNaN(new Date(value).getTime())?formatBusinessDateTime(new Date(value),inquiry.branch.timezone):"Не указан";return <article key={entry.id}><p>{formatBusinessDateTime(entry.occurredAt,inquiry.branch.timezone)} · {entry.actorUser?.displayName??"Система"} · {({INQUIRY_CREATED:"Создано",INQUIRY_UPDATED:"Изменено",INQUIRY_SELECTION_UPDATED:"Обновлён подбор",SOURCE_CONVERTED_TO_ORDER:"Создан заказ",INQUIRY_FITTING_CREATED:"Создана примерка"} as Record<string,string>)[entry.action]??"Изменение обращения"}</p>{m?.status!==undefined&&<p>Статус: {m.previousStatus!==undefined&&`${status(m.previousStatus)} → `}{status(m.status)}</p>}{m?.assignedMembershipId!==undefined&&<p>Ответственный: {entry.previousAssignee} → {entry.assignee}</p>}{m?.nextActionAt!==undefined&&<p>Срок: {when(m.previousNextActionAt)} → {when(m.nextActionAt)}</p>}{m?.nextActionChanged===true&&<p>Изменено следующее действие.</p>}{m?.detailsChanged===true&&<p>Обновлены поля обращения. Содержимое контактов и текста не копируется в аудит.</p>}</article>})}</section>

  </AppShell>;
}
