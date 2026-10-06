"use client";

import { useActionState } from "react";
import { saveDocumentAction } from "./actions";

export function SaveDocumentForm({ orderId, baseVersion, idempotencyKey }: {
  orderId: string; baseVersion: number; idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState(saveDocumentAction.bind(null, orderId), { error: null });
  return <form action={action} className="rental-document-form">
    <input type="hidden" name="baseVersion" value={baseVersion} />
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <label htmlFor="revision-reason">{baseVersion > 0 ? "Причина новой версии (обязательно)" : "Примечание к сохранению (необязательно)"}</label>
    <textarea id="revision-reason" name="reason" required={baseVersion > 0} maxLength={500} rows={3}
      placeholder="Например: зафиксирован частичный возврат" disabled={pending} />
    <p>Укажите только причину. Не добавляйте паспортные, финансовые или другие лишние персональные данные.</p>
    <button className="primary" disabled={pending} type="submit">{pending ? "Сохранение…" : baseVersion > 0 ? "Сохранить новую версию" : "Сохранить версию"}</button>
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
  </form>;
}
