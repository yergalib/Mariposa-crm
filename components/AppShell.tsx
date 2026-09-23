import { Sidebar } from "./Sidebar";
import { requireRouteAccess } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/permissions/effective";
import { ButtonLink, PageHeader } from "@/components/ui";
import { getAvailableOrganizations } from "@/lib/auth/organizations";

export async function AppShell({ active = "/", title, subtitle, children, action }: { active?: string; title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  const session = await requireRouteAccess(active);
  const [permissions, organizations] = await Promise.all([getEffectivePermissions(session), getAvailableOrganizations(session)]);
  const globalAction = permissions.has("ORDER_CREATE") ? <ButtonLink href="/orders/new" variant="primary" icon="plus">Новый заказ</ButtonLink> : null;
  const actions = action || globalAction ? <>{action}{globalAction}</> : undefined;

  return (
    <div className="app-shell">
      <Sidebar active={active} session={session} permissions={permissions} organizations={organizations} />
      <main className="main">
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
