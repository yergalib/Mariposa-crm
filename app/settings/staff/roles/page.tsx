import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { defaultHasPermission, FUTURE_PERMISSION_CATEGORIES, PERMISSION_CATEGORY_LABELS, PERMISSION_REGISTRY, type PermissionCategory } from "@/lib/permissions/registry";
import { roleLabel } from "@/lib/staff/queries";
import type { AppRole } from "@/lib/auth/access";
import "./roles.css";

const roles: AppRole[] = ["OWNER", "DIRECTOR", "SELLER", "CASHIER"];
const categories = Object.keys(PERMISSION_CATEGORY_LABELS) as PermissionCategory[];

export default async function StaffRolesPage() {
  const session = await requireRouteAccess("/settings/staff/roles");
  await requirePermission(session, "STAFF_VIEW");
  return <AppShell active="/settings" title="Роли и доступ" subtitle="Стандартные права сотрудников">
    <div className="toolbar"><Link href="/settings/staff">← Сотрудники</Link></div>
    <section className="panel"><p>Роль задаёт права по умолчанию. Владелец может изменить отдельные права в карточке сотрудника. Филиалы ограничиваются отдельно; доступ к разделу ещё не означает доступ ко всем данным организации.</p>
      <div className="role-matrix-scroll"><table className="role-matrix"><thead><tr><th scope="col">Функция</th>{roles.map(role=><th key={role} scope="col">{roleLabel[role]}</th>)}</tr></thead><tbody>{categories.map(category=><FragmentRows key={category} category={category}/>)}</tbody></table></div>
      <p className="role-matrix-note">«Планируется» означает, что право уже обозначено в системе, но сам раздел может ещё не работать. Настоящие учётные записи продавца и директора пока не созданы; их экраны проверим перед запуском.</p>
    </section>
  </AppShell>;
}

function FragmentRows({category}:{category:PermissionCategory}) {
  const rows = Object.entries(PERMISSION_REGISTRY).filter(([, value])=>value[0]===category) as [keyof typeof PERMISSION_REGISTRY, readonly [PermissionCategory,string]][];
  return <><tr className="role-matrix-category"><th colSpan={roles.length+1} scope="rowgroup">{PERMISSION_CATEGORY_LABELS[category]}{FUTURE_PERMISSION_CATEGORIES.has(category)&&" · часть функций планируется"}</th></tr>{rows.map(([key,[,label]])=><tr key={key}><th scope="row">{label}</th>{roles.map(role=><td key={role} aria-label={`${roleLabel[role]}: ${defaultHasPermission(role,key)?"разрешено":"запрещено"}`}><span className={defaultHasPermission(role,key)?"allowed":"denied"}>{defaultHasPermission(role,key)?"Да":"—"}</span></td>)}</tr>)}</>;
}
