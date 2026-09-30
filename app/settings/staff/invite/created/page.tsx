import Link from "next/link";
import { cookies } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { getInvitation } from "@/lib/staff/invitations";

export default async function InvitationCreated() {
  const session = await requireRouteAccess("/settings/staff");
  await requirePermission(session, "STAFF_INVITE");
  const token = (await cookies()).get("staff-invite-link")?.value;
  const invitation = token ? await getInvitation(token).catch(() => null) : null;
  if (!invitation || invitation.organizationId !== session.organizationId) {
    return <AppShell active="/settings" title="Приглашение"><section className="panel"><p>Ссылка больше не доступна. Проверьте список приглашений или создайте новое.</p><Link href="/settings/staff">К сотрудникам</Link></section></AppShell>;
  }
  const path = `/invite/${encodeURIComponent(token!)}`;
  return <AppShell active="/settings" title="Приглашение создано"><section className="panel"><h2>Ссылка для {invitation.email}</h2><p>Приглашение действует 48 часов. Откройте ссылку, чтобы задать пароль сотрудника. Эта страница показывает ссылку только в течение пяти минут.</p><p><Link className="primary-button" href={path}>Открыть приглашение</Link></p><p>Для передачи ссылки удерживайте кнопку и выберите «Скопировать ссылку».</p><Link href="/settings/staff">К сотрудникам</Link></section></AppShell>;
}
