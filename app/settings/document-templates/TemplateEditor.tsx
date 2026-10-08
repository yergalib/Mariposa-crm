"use client";
import { useState } from "react";
import { RetainedActionForm } from "@/components/RetainedActionForm";
import { TEMPLATE_DEFAULTS, TEMPLATE_LABELS, TEMPLATE_VARIABLES, validateTemplateBody, type TemplateKind } from "@/lib/document-templates/catalog";
import { createTemplateAction } from "./actions";

type Version = { branchId: string | null; kind: string; version: number; body: string };
export function TemplateEditor({ branches, latest, examples, canGlobal, idempotencyKey }: { branches: { id: string; name: string }[]; latest: { branchId: string | null; kind: string; version: number }[]; examples: Version[]; canGlobal: boolean; idempotencyKey: string }) {
  const [kind, setKind] = useState<TemplateKind>("RENTAL_NOTE");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [body, setBody] = useState("");
  const baseVersion = latest.find(row => row.kind === kind && (row.branchId ?? "") === branchId)?.version ?? 0;
  let preview = "", error = "";
  try { preview = validateTemplateBody(kind, body); } catch (reason) { error = reason instanceof Error ? reason.message : "Проверьте текст."; }
  return <section className="card template-editor"><h2>Новая версия — черновик</h2>
    <p>Сохранение не утверждает текст. Предпросмотр использует вымышленные факты, не данные клиента. HTML, SQL, финансовые и контактные переменные не поддерживаются.</p>
    <RetainedActionForm action={createTemplateAction} className="form-grid">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey}/><input type="hidden" name="baseVersion" value={baseVersion}/>
      <label>Назначение<select name="kind" value={kind} onChange={event => { const selected = event.target.value as TemplateKind; setKind(selected); setBody(TEMPLATE_DEFAULTS[selected]); }}>{Object.entries(TEMPLATE_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Область<select name="branchId" value={branchId} onChange={event => setBranchId(event.target.value)}>{canGlobal && <option value="">Общий текст организации</option>}{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label className="template-wide">Взять существующий текст<select value="" onChange={event => { const index = Number(event.target.value); const row = examples[index]; if (row) { setKind(row.kind as TemplateKind); setBranchId(row.branchId ?? ""); setBody(row.body); } }}><option value="">Выберите версию для копирования</option>{examples.map((row,index) => <option key={index} value={index}>{TEMPLATE_LABELS[row.kind as TemplateKind]} · v{row.version} · {branches.find(branch => branch.id === row.branchId)?.name ?? "Общий"}</option>)}</select></label>
      <label className="template-wide">Обычный текст<textarea name="body" value={body} onChange={event => setBody(event.target.value)} maxLength={1200} rows={7} required/></label>
      <p className="template-wide">Разрешённые переменные: {TEMPLATE_VARIABLES[kind].map(key => `{{${key}}}`).join(", ")}. Следующая версия: {baseVersion + 1}.</p>
      <button className="primary" disabled={!preview || (!branchId && !canGlobal)}>Сохранить черновик версии</button>
    </RetainedActionForm>
    <section aria-live="polite" className="template-preview"><h3>Предпросмотр — не утверждён</h3>{preview ? <p style={{whiteSpace:"pre-wrap"}}>{preview}</p> : <p>{body ? error : "Введите информационный текст или выберите клиентский черновик."}</p>}{kind === "RENTAL_NOTE" ? <p>После явного утверждения этот блок попадёт только в новые сохранённые документы V3. Старые документы останутся прежними.</p> : <p>Отправка отсутствует. Утверждение шаблона не отправляет сообщение и не подтверждает согласие клиента.</p>}</section>
  </section>;
}
