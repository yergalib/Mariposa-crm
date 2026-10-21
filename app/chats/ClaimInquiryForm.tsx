"use client";

import { useActionState } from "react";
import { saveInquiryAction } from "./actions";
import type { InquiryFields } from "@/lib/inquiries/validation";

/** A shortcut to the existing version-checked edit operation, not a new mutation. */
export function ClaimInquiryForm({ id, version, fields }: { id: string; version: number; fields: InquiryFields }) {
  const [state, action, pending] = useActionState(saveInquiryAction.bind(null, id), { error: null });
  return <form action={action} className="inquiry-claim">
    <input type="hidden" name="version" value={version}/>
    <input type="hidden" name="status" value="IN_PROGRESS"/>
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value ?? ""}/>)}
    <button type="submit" className="primary" disabled={pending} aria-describedby="inquiry-claim-help">{pending ? "Сохранение…" : "Взять в работу"}</button>
    <small id="inquiry-claim-help">Вы станете ответственным. Статус изменится на «В работе».</small>
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
  </form>;
}
