import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { getDocumentSettings } from "@/lib/document-settings";
import { DocumentSettingsForm } from "./DocumentSettingsForm";
export default async function Page({ searchParams }: { searchParams: Promise<{ branchId?: string; ok?: string }> }) {
  const actor = await requireRouteAccess("/settings"), raw = await searchParams;
  let branches: Awaited<ReturnType<typeof getDocumentSettings>>;
  try { branches = await getDocumentSettings(actor); }
  catch (error) { return <AppShell active="/settings" title="Реквизиты документов"><p role="alert">{error instanceof Error ? error.message : "Нет доступа."}</p></AppShell>; }
  const current = raw.branchId ? branches.find(b => b.branchId === raw.branchId) : branches[0];
  return <AppShell active="/settings" title="Реквизиты документов" subtitle="Будущие сохранённые документы аренды"><Link href="/settings">Все настройки</Link>
    {raw.ok && <p className="notice">Реквизиты сохранены. Новые версии документов будут использовать их.</p>}
    <form method="get" className="toolbar"><label>Филиал<select name="branchId" defaultValue={current?.branchId}>{branches.map(b => <option key={b.branchId} value={b.branchId}>{b.branchName}</option>)}</select></label><button>Открыть</button></form>
    {current ? <DocumentSettingsForm key={current.revision + current.branchId} initial={current} capturedAt={new Date().toISOString()}/> : <p role="alert">Нет доступного активного филиала.</p>}
    <section className="card"><h2>Текст и печать</h2><p>Используется существующий текст неподписанного документа аренды. Условия, штрафы, юридические реквизиты и подписи здесь не редактируются: утверждённых полей для них нет. Разметка и исполняемые шаблоны не поддерживаются; введённое значение выводится только как текст.</p><p>Создайте новую сохранённую версию в разделе документов заказа, затем откройте её для печати. Прежние версии сохраняют прежний шаблон и реквизиты. Рабочий лист по текущим данным заказа остаётся отдельной формой.</p></section>
  </AppShell>;
}
