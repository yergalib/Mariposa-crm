import { staffNotifications } from "@/lib/staff/notifications";
import Link from "next/link";
import { Sidebar } from "./Sidebar";
import { requireRouteAccess } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/permissions/effective";
import { ButtonLink, PageHeader } from "@/components/ui";
import { getAvailableOrganizations } from "@/lib/auth/organizations";
import { OrganizationSwitcher } from "@/components/OrganizationSwitcher";

export async function AppShell({ active = "/", title, subtitle, children, action, inboxCount, nextStep }: { active?: string; title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode; inboxCount?: number; nextStep?: string }) {
  const session = await requireRouteAccess(active);
  const [permissions, organizations, inbox] = await Promise.all([getEffectivePermissions(session), getAvailableOrganizations(session), inboxCount === undefined ? staffNotifications(session) : Promise.resolve(null)]);
  const globalAction = active === "/" && permissions.has("ORDER_CREATE") ? <ButtonLink href="/orders/new" variant="primary" icon="plus">Новый заказ</ButtonLink> : null;
  const pending = inboxCount ?? inbox!.sections.reduce((sum, section) => sum + section.rows.length, 0);
  const actions = <><Link className="secondary button-link" href="/notifications" aria-label={`Уведомления: ${pending}`}>Уведомления{pending > 0 && <span className="inbox-count">{pending}</span>}</Link>{action}{!action && globalAction}</>;

  return (
    <div className={`app-shell${active === "/payroll" ? "" : " crm-clarity"}`}>
      <Sidebar active={active} session={session} permissions={permissions} organizations={organizations} />
      <main className="main">
        <div className="tablet-organization-bar">
          <OrganizationSwitcher organizations={organizations} currentMembershipId={session.membershipId} id="tablet-organization-membership" />
        </div>
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
        {nextStep && <p className="workflow-next"><strong>Следующий шаг</strong><span>{nextStep}</span></p>}
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
