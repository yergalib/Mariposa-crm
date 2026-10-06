"use client";
import { useActionState, useState } from "react";
import { saveInquiryAction } from "./actions";
import { SOURCE_LABELS, STATUS_LABELS, type InquiryFields } from "@/lib/inquiries/validation";

export function InquiryForm({ id = null, branchId, timezone, creationKey = "", version = 1, initial, canAssign, canClose, assignees, variants = [] }: {
  id?: string | null; branchId: string; timezone: string; creationKey?: string; version?: number;
  initial?: InquiryFields & { status: keyof typeof STATUS_LABELS };
  canAssign: boolean; canClose: boolean;
  assignees: { id: string; name: string }[]; variants?: { id: string; label: string }[];
}) {
  const [values, setValues] = useState(initial ?? { subject: "", customerLabel: "", replyContact: "", requestText: "", requestedSize: "",
    requestedFrom: "", requestedUntil: "", nextAction: "", nextActionAt: "", assignedMembershipId: "", status: "NEW" });
  const [source, setSource] = useState("CRM"), [selected, setSelected] = useState<string[]>([]);
  const [state, action, pending] = useActionState(saveInquiryAction.bind(null, id), { error: null });
  const change = (key: keyof typeof values, value: string) => setValues(previous => ({ ...previous, [key]: value }));
  return <form onReset={event=>event.preventDefault()} action={action} className="inquiry-edit">
    <input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="creationKey" value={creationKey} /><input type="hidden" name="version" value={version} />
    <fieldset disabled={pending}>
      {!id && <label>Источник<select name="source" value={source} onChange={event => setSource(event.target.value)}>{Object.entries(SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      <label>Тема обращения<input name="subject" maxLength={200} required value={values.subject} onChange={event => change("subject", event.target.value)} /></label>
      <label>Как обращаться к клиенту (необязательно)<input name="customerLabel" maxLength={120} value={values.customerLabel} onChange={event => change("customerLabel", event.target.value)} /></label>
      <label>Обратный контакт (необязательно)<input name="replyContact" type="text" maxLength={254} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="reply-contact-help" value={values.replyContact ?? ""} onChange={event => change("replyContact", event.target.value)} /></label>
      <small id="reply-contact-help">Телефон (7–15 цифр, можно с +) или email. Очистите поле, чтобы удалить контакт.</small>
      <label>Запрос клиента<textarea name="requestText" rows={4} maxLength={2000} value={values.requestText} onChange={event => change("requestText", event.target.value)} /></label>
      <p>Не вводите паспортные, платёжные и лишние персональные данные. Это заявка, а не бронь.</p>
      {!id && <label>Варианты товаров (необязательно, до 20)<select name="variantIds" multiple size={6} value={selected} onChange={event => setSelected(Array.from(event.target.selectedOptions, option => option.value))}>
        {variants.map(variant => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
      </select><small>Для нескольких вариантов используйте Ctrl/⌘. Если нужного нет, опишите товар в запросе.</small></label>}
      <label>Пожелание по размеру<input name="requestedSize" maxLength={100} value={values.requestedSize} onChange={event => change("requestedSize", event.target.value)} /></label>
      <p>Даты и сроки: время филиала ({timezone}). Период — обе даты или ни одной.</p>
      <div className="inquiry-edit-pair"><label>Начало<input type="datetime-local" name="requestedFrom" value={values.requestedFrom} onChange={event => change("requestedFrom", event.target.value)} /></label>
        <label>Конец<input type="datetime-local" name="requestedUntil" value={values.requestedUntil} onChange={event => change("requestedUntil", event.target.value)} /></label></div>
      {id && <label>Статус<select name="status" value={values.status} onChange={event => change("status", event.target.value)}>
        {Object.entries(STATUS_LABELS).filter(([key]) => canClose || (values.status === "CLOSED" ? key === "CLOSED" : key !== "CLOSED")).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>}
      {canAssign ? <label>Ответственный<select name="assignedMembershipId" value={values.assignedMembershipId} onChange={event => change("assignedMembershipId", event.target.value)}>
        <option value="">Не назначен</option>{assignees.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
        {values.assignedMembershipId && !assignees.some(member => member.id === values.assignedMembershipId) && <option value={values.assignedMembershipId}>Текущий ответственный (недоступен для нового назначения)</option>}
      </select></label> : <input type="hidden" name="assignedMembershipId" value={values.assignedMembershipId} />}
      <label>Следующее действие<input name="nextAction" maxLength={500} value={values.nextAction} onChange={event => change("nextAction", event.target.value)} /></label>
      <label>Срок следующего действия<input type="datetime-local" name="nextActionAt" value={values.nextActionAt} onChange={event => change("nextActionAt", event.target.value)} /></label>
      <button className="primary" type="submit">{pending ? "Сохранение…" : id ? "Сохранить изменения" : "Создать обращение"}</button>
    </fieldset>
    {state.error && <p role="alert" className="notice error">{state.error}</p>}
  </form>;
}
