import Link from "next/link";
import { randomUUID } from "node:crypto";
import { AppShell } from "@/components/AppShell";
import { RetainedActionForm } from "@/components/RetainedActionForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { listTextTemplates } from "@/lib/document-templates/service";
import { TEMPLATE_LABELS, validateTemplateBody, type TemplateKind } from "@/lib/document-templates/catalog";
import { TemplateEditor } from "./TemplateEditor";
import { approveTemplateAction, archiveTemplateAction } from "./actions";
import "./templates.css";
const states: Record<string,string> = {DRAFT:"Черновик",APPROVED:"Утверждён",ARCHIVED:"Архив"};
export default async function Templates({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const actor = await requireRouteAccess("/settings"), query = await searchParams;
  let data;
  try { data = await listTextTemplates(actor); }
  catch { return <AppShell active="/settings" title="Текстовые шаблоны"><p role="alert">Нет доступа к шаблонам или локальная модель ещё не установлена.</p></AppShell>; }
  const latest = data.latest;
  return <AppShell active="/settings" title="Текстовые шаблоны" subtitle="Версии, предпросмотр и явное утверждение"><Link href="/settings">Все настройки</Link>
    <p>Информационные тексты неподписанных документов и клиентские черновики. Юридические условия, штрафы, подписи и отправка сообщений здесь не реализуются. Архив хранится без удаления.</p>
    {query.ok && <p role="status">{query.ok === "draft" ? "Новая версия сохранена как неутверждённый черновик." : query.ok === "approved" ? "Выбранная версия явно утверждена. Предыдущая утверждённая версия этой области сохранена в архиве." : query.ok === "archived" ? "Версия архивирована и сохранена." : "Обновите список версий."}</p>}
    {data.canManage && <TemplateEditor branches={data.branches} latest={latest} examples={data.versions.filter(row => row.branchId !== null || data.canManageGlobal)} canGlobal={data.canManageGlobal} idempotencyKey={randomUUID()}/>}
    <section className="template-versions"><h2>Сохранённые версии</h2>{!data.versions.length && <p>Версий пока нет. Тексты не создаются и не утверждаются автоматически.</p>}{data.versions.map(row => {
      const globalAllowed = row.branchId !== null || data.canManageGlobal;
      const isLatest = latest.some(item => item.branchId === row.branchId && item.kind === row.kind && item.version === row.version);
      const preview = validateTemplateBody(row.kind as TemplateKind, row.body);
      return <article className="card" key={row.id}><h3>{TEMPLATE_LABELS[row.kind as TemplateKind]} · v{row.version}</h3><p>{data.branches.find(branch => branch.id === row.branchId)?.name ?? "Общий текст организации"} · {states[row.state]} · {row.createdAt.toISOString()}</p><details><summary>Текст и предпросмотр</summary><pre>{row.body}</pre><p style={{whiteSpace:"pre-wrap"}}>{preview}</p><small>Предпросмотр использует вымышленные факты. Это не сообщение клиенту.</small></details>
        {row.state === "DRAFT" && data.canApprove && globalAllowed && isLatest && <RetainedActionForm action={approveTemplateAction} className="template-transition"><input type="hidden" name="id" value={row.id}/><input type="hidden" name="contentHash" value={row.contentHash}/><label><input type="checkbox" name="confirmed" value="yes" required/>Я проверил текст этой версии и явно утверждаю его для будущего использования</label><button className="secondary">Утвердить эту версию</button></RetainedActionForm>}
        {row.state !== "ARCHIVED" && data.canManage && globalAllowed && <RetainedActionForm action={archiveTemplateAction} className="template-transition"><input type="hidden" name="id" value={row.id}/><input type="hidden" name="contentHash" value={row.contentHash}/><label><input type="checkbox" name="confirmed" value="yes" required/>Архивировать версию, сохранив её историю</label><button className="secondary">Архивировать</button></RetainedActionForm>}
      </article>;
    })}{data.versions.length === 100 && <p>Показаны последние 100 версий. Архивные версии сохраняются.</p>}</section>
  </AppShell>;
}
