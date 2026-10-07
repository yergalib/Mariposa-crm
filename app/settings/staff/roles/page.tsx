import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { permissionRolesView } from "@/lib/permissions/roles";
import { PERMISSION_CATEGORY_LABELS, PERMISSION_REGISTRY, type PermissionCategory, type PermissionKey } from "@/lib/permissions/registry";
import { assignRoleAction, saveRoleAction } from "./actions";
import "./roles.css";

const categories = Object.keys(PERMISSION_CATEGORY_LABELS) as PermissionCategory[];
function Checkboxes({ selected, canGrant, disabled, prefix }: { selected: string[]; canGrant: PermissionKey[]; disabled: boolean; prefix: string }) {
  return <div className="permission-groups">{categories.map(category => <fieldset key={category} disabled={disabled}><legend>{PERMISSION_CATEGORY_LABELS[category]}</legend>
    {Object.entries(PERMISSION_REGISTRY).filter(([, value]) => value[0] === category).map(([key, [, label]]) => <label key={key} className="permission-checkbox"><input id={`${prefix}-${key}`} type="checkbox" name="permissionKey" value={key} defaultChecked={selected.includes(key)} disabled={!canGrant.includes(key as PermissionKey)}/><span>{label}</span></label>)}
  </fieldset>)}</div>;
}
export default async function StaffRolesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const actor = await requireRouteAccess("/settings/staff/roles"), data = await permissionRolesView(actor), params = await searchParams;
  return <AppShell active="/settings" title="Роли и доступ" subtitle="Настраиваемые наборы разрешений">
    <div className="toolbar"><Link href="/settings/staff">← Сотрудники</Link></div>
    {params.error && <p role="alert">{params.error}</p>}{params.saved && <p role="status">Сохранено. Сеансы затронутых сотрудников завершены; требуется новый вход.</p>}
    <section className="panel"><p>Галочка разрешает операцию. Название набора не даёт дополнительных прав. Филиалы задаются отдельно; просмотр раздела и выполнение операции — отдельные разрешения. Например, возврат платежа требует доступа к заказу и разрешения на возврат.</p><p>Индивидуальное «Разрешить» или «Запретить» в карточке сотрудника имеет приоритет над набором. Владелец сохраняет полный доступ. Нельзя изменить собственный набор, передать права выше своих или изменить владение организацией здесь.</p></section>
    {data.roles.map(role => <details className="panel" key={`${role.id}:${role.version}`}><summary>{role.name} · сотрудников: {role.memberCount}</summary>
      <form action={saveRoleAction}><input type="hidden" name="id" value={role.id}/><input type="hidden" name="version" value={role.version}/><label>Название набора<input name="name" defaultValue={role.name} required maxLength={80} disabled={!role.editable}/></label>
        <Checkboxes selected={role.permissionKeys} canGrant={data.canGrant} disabled={!role.editable} prefix={role.id}/>
        {role.editable ? <button className="primary">Сохранить права набора</button> : <p>Изменить этот набор может другой уполномоченный сотрудник или владелец.</p>}
      </form>
    </details>)}
    <details className="panel"><summary>Создать набор прав</summary><form action={saveRoleAction}><label>Название<input name="name" required maxLength={80} placeholder="Например, кладовщик"/></label><Checkboxes selected={[]} canGrant={data.canGrant} disabled={false} prefix="new"/><button className="primary">Создать набор</button></form></details>
    <section className="panel"><h2>Назначение сотрудникам</h2><p>Смена набора сохраняет индивидуальные исключения. Проверьте итоговые права в карточке сотрудника.</p>
      {data.members.map(member => <form action={assignRoleAction} key={member.id} className="toolbar"><input type="hidden" name="membershipId" value={member.id}/><input type="hidden" name="expectedRoleId" value={member.permissionRoleId ?? ""}/><Link href={`/settings/staff/${member.id}`}>{member.name}</Link><label>Набор<select name="roleId" defaultValue={member.permissionRoleId ?? ""} required><option value="" disabled>Выберите</option>{data.roles.map(role => <option value={role.id} key={role.id}>{role.name}</option>)}</select></label><span>Исключений: {member.overrideCount}</span><button className="secondary">Назначить</button></form>)}
      {!data.members.length && <p>Нет сотрудников, чей доступ вы можете изменять.</p>}
    </section>
  </AppShell>;
}
