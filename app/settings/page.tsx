import Link from "next/link";
import { AppShell } from "@/components/AppShell";
export default function Page(){ return <AppShell active="/settings" title="Настройки" subtitle="Управление организацией"><section className="panel"><h2>Доступ</h2><p>Сотрудники, роли и филиалы.</p><Link className="primary-button" href="/settings/staff">Сотрудники</Link></section></AppShell> }
