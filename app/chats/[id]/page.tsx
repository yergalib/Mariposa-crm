import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { getInquiry, inquiriesNotInstalled, inquiryOptions } from "@/lib/inquiries/service";
import { SOURCE_LABELS, STATUS_LABELS } from "@/lib/inquiries/validation";
import { formatBusinessDateTime, formatBusinessLocalDateTimeInput } from "@/lib/calendar/timezone";
import { InquiryForm } from "../InquiryForm";
import "../chats.css";

export default async function InquiryCard({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRouteAccess("/chats"), { id } = await params;
  let inquiry;
  try { inquiry = await getInquiry(session, id); }
  catch (error) {
    if (!inquiriesNotInstalled(error)) throw error;
    return <AppShell active="/chats" title="Обращение"><p className="card">Очередь пока не включена. Требуется согласованное обновление базы данных.</p></AppShell>;
  }
  if (!inquiry) notFound();
  const [canEdit, canAssign, canClose] = await Promise.all((["LEAD_EDIT", "LEAD_ASSIGN", "LEAD_CLOSE"] as const).map(key => hasPermission(session, key)));
  const options = canEdit ? await inquiryOptions(session, inquiry.branchId, "", false) : null;
  const local = (value: Date | null) => value ? formatBusinessLocalDateTimeInput(value, inquiry.branch.timezone) : "";
  const display = (value: Date | null) => value ? formatBusinessDateTime(value, inquiry.branch.timezone) : "Не указано";
  return <AppShell active="/chats" title={inquiry.subject} subtitle={`${SOURCE_LABELS[inquiry.source]} · ${inquiry.branch.name} · ${STATUS_LABELS[inquiry.status]}`}>
    <div className="inquiry-queue"><section className="card inquiry-card"><Link href="/chats">← К очереди</Link>
      <p>Обращение не является заказом или бронью. Наличие и цена требуют отдельной проверки.</p>
      <p>Обратный контакт: {inquiry.replyContact ?? "Не указан"}</p>
      <p>Клиент: {inquiry.customerLabel ?? "Не указан"}</p><p>{inquiry.requestText ?? "Описание не указано"}</p>
      <p>Период: {display(inquiry.requestedFrom)} — {display(inquiry.requestedUntil)} ({inquiry.branch.timezone})</p>
      <p>Размер: {inquiry.requestedSize ?? "Не указан"}</p>
      <p>Ответственный: {inquiry.assignedTo?.user.displayName ?? "Не назначен"}{inquiry.assignedTo?.status !== "ACTIVE" && inquiry.assignedTo ? " (неактивен)" : ""}</p>
      <p>Следующее действие: {inquiry.nextAction ?? "Не указано"} · Срок: {display(inquiry.nextActionAt)}</p>
      <h2>Выбранные товары</h2>{inquiry.items.length ? <ul>{inquiry.items.map(item => <li key={item.id}>{item.nameSnapshot} · {item.sizeSnapshot} · {item.skuSnapshot}</li>)}</ul> : <p>Пока не выбраны.</p>}
      <p>Выбор товаров сохранён при регистрации. Уточнения можно записать в описании запроса.</p>
      <Link href="/whatsapp">Проверить наличие для ответа</Link>
    </section>
    {canEdit && options && <section className="card"><h2>Обработка обращения</h2>
      <InquiryForm key={inquiry.version} id={id} branchId={inquiry.branchId} timezone={inquiry.branch.timezone} version={inquiry.version}
        canAssign={canAssign} canClose={canClose} assignees={options.assignees}
        initial={{ subject: inquiry.subject, customerLabel: inquiry.customerLabel ?? "", requestText: inquiry.requestText ?? "", requestedSize: inquiry.requestedSize ?? "",
          requestedFrom: local(inquiry.requestedFrom), requestedUntil: local(inquiry.requestedUntil), status: inquiry.status,
          assignedMembershipId: inquiry.assignedMembershipId ?? "", nextAction: inquiry.nextAction ?? "", nextActionAt: local(inquiry.nextActionAt) }} />
    </section>}
    </div>
  </AppShell>;
}
