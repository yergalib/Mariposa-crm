import { switchOrganizationAction } from "@/app/organization-actions";
import type { AvailableOrganization } from "@/lib/auth/organizations";

export function OrganizationSwitcher({ organizations, currentMembershipId, id, className = "" }: { organizations: AvailableOrganization[]; currentMembershipId: string; id: string; className?: string }) {
  const current = organizations.find((organization) => organization.membershipId === currentMembershipId) ?? organizations[0];
  if (!current) return null;
  if (organizations.length === 1) return <span className={`organization-current ${className}`.trim()} title={current.organizationName}>{current.organizationName}</span>;
  return <form action={switchOrganizationAction} className={`organization-switch ${className}`.trim()}>
    <label htmlFor={id}>Организация</label>
    <div className="organization-switch-controls">
      <select id={id} name="membershipId" defaultValue={currentMembershipId} aria-label="Текущая организация">
        {organizations.map((organization) => <option value={organization.membershipId} key={organization.membershipId}>{organization.organizationName}</option>)}
      </select>
      <button type="submit" title="Перейти в выбранную организацию" aria-label="Перейти в выбранную организацию">Перейти</button>
    </div>
  </form>;
}
