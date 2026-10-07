"use client";
import { useState } from "react";
import { RetainedActionForm } from "@/components/RetainedActionForm";
import { RentalDocumentV2 } from "@/components/RentalDocumentV2";
import { saveDocumentSettingsAction } from "./actions";
type Settings = { branchId: string; organizationName: string; branchName: string; address: string; phone: string; timezone: string; revision: string };
export function DocumentSettingsForm({ initial, capturedAt }: { initial: Settings; capturedAt: string }) {
  const [draft, setDraft] = useState(initial);
  return <><RetainedActionForm className="card form-grid document-settings-form" action={saveDocumentSettingsAction}>
    <input type="hidden" name="branchId" value={initial.branchId}/><input type="hidden" name="revision" value={initial.revision}/>
    {([['organizationName', 'Название организации', 100], ['branchName', 'Название филиала', 100], ['address', 'Адрес филиала', 300], ['phone', 'Телефон филиала', 300]] as const).map(([key, label, max]) => <label key={key}>{label}<input name={key} value={draft[key]} maxLength={max} required={max === 100} onChange={event => setDraft({ ...draft, [key]: event.target.value })}/></label>)}
    <p>Это общие реквизиты CRM: название организации изменится для всех филиалов. Сохранённые ранее документы останутся без изменений. Адрес и телефон можно оставить пустыми.</p><button className="primary">Сохранить для будущих документов</button>
    </RetainedActionForm><section className="card document-settings-preview"><h2>Предпросмотр будущего документа</h2><p>Несохранённый образец без заказа. Значения клиента, позиций и дат будут взяты из выбранного заказа при сохранении документа.</p><RentalDocumentV2 version={1} reason={null} snapshot={{ schemaVersion: 2, templateVersion: 2, capturedAt, orderNumber: 'Предпросмотр — без заказа', orderStatusLabel: 'Из заказа', customerName: 'Из заказа', branchName: draft.branchName, timezone: initial.timezone, rentalStartAt: null, rentalEndAt: null, items: [], issuer: { organizationName: draft.organizationName, address: draft.address || null, phone: draft.phone || null } }}/></section></>;
}
