import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
export default async function Page() {
  const session = await requireRouteAccess("/settings");
  const settingsVisible = await hasPermission(session, "SETTINGS_VIEW");
  const auditVisible = await hasPermission(session, "AUDIT_LOG_VIEW");
  return <AppShell active="/settings" title="Настройки" subtitle="Профиль и доступ">
    {session.role === "OWNER" && settingsVisible && <section className="panel"><h2>Реквизиты документов</h2><p>Настройки будущих сохранённых документов и предпросмотр.</p><Link href="/settings/documents">Настроить документы</Link></section>}
    {settingsVisible && <section className="panel"><h2>Настройки бизнеса</h2><p>Организация, филиалы, места хранения и способы оплаты.</p><Link className="primary-button" href="/settings/business">Открыть настройки</Link></section>}
    {(session.role === "OWNER" || session.role === "DIRECTOR") && <section className="panel"><h2>Доступ</h2><p>Сотрудники, роли и филиалы.</p><Link className="primary-button" href="/settings/staff">Сотрудники</Link></section>}
    <section className="panel"><h2>Моя безопасность</h2><p>Смена собственного пароля и сведения о текущем доступе.</p><Link className="secondary button-link" href="/settings/security">Безопасность</Link></section>
    {auditVisible && <section className="panel"><h2>Журнал действий</h2><p>Кто, когда и с каким результатом выполнил записанное действие.</p><Link className="secondary button-link" href="/settings/audit">Открыть журнал</Link></section>}
  </AppShell>;
}
