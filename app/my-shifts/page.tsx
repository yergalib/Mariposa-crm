import {ContextPanel} from "@/components/ContextPanel";
import {WorkflowTabs} from "@/components/WorkflowTabs";
import { randomUUID } from "node:crypto";
import { AppShell } from "@/components/AppShell";
import { RetainedActionForm } from "@/components/RetainedActionForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { ownClaims, CLAIM_LABELS } from "@/lib/payroll/service";
import { localDateKey } from "@/lib/calendar/timezone";
import { submitOwnShiftAction } from "@/app/payroll/actions";
export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const actor = await requireRouteAccess("/my-shifts"), query = await searchParams;
  const data = await ownClaims(actor), branch = data.branches.find(b => b.id === actor.defaultBranchId) ?? data.branches[0];
  return <AppShell active="/my-shifts" title="Мои смены" subtitle="Отработано и отправлено руководителю">
    <WorkflowTabs active="/my-shifts" items={[{href:"/schedule",label:"График"},{href:"/my-shifts",label:"Мои смены"}]}/><div className="staff-workspace-intro"><span>Отметьте полную смену. Руководитель проверит её и подтвердит выплату.</span>
    {query.saved === "1" && <p className="notice" role="status">Отметка отправлена руководителю. Начисление и запись о выплате появятся только после его подтверждения.</p>}
    {branch ? <ContextPanel title="Отметить отработанную смену" trigger="Отметить смену" primary><p>Можно выбрать прошедшую дату. Сумму назначает руководитель по ставке.</p><RetainedActionForm action={submitOwnShiftAction} className="card form-grid payroll-own-form">
      <input type="hidden" name="creationKey" value={randomUUID()}/>
      <label>Филиал<select name="branchId" defaultValue={branch.id}>{data.branches.map(b => <option key={b.id} value={b.id}>{b.name} · {b.timezone}</option>)}</select></label>
      <label>Дата отработанной смены в филиале<input name="workDate" type="date" defaultValue={localDateKey(new Date(), branch.timezone)} required/></label>
      <label><input name="standardShift" type="checkbox" value="yes" required/> Я полностью отработал обычную смену за эту дату, без переработки и праздничного расчёта.</label>
      <button className="primary">Отправить отметку руководителю</button>
    </RetainedActionForm></ContextPanel> : <p>Нет доступного активного филиала.</p>}</div>
    <section className="card payroll-own-history"><h2>Мои отметки</h2>
      {data.claims.map(row => <article className="payroll-row" key={row.id}><strong>{row.workDate.toISOString().slice(0, 10)} · {row.branch.name}</strong><p>{CLAIM_LABELS[row.status]}</p>{row.decisionReason && <p>Причина: {row.decisionReason}</p>}</article>)}
      {!data.claims.length && <p>Отметок пока нет.</p>}
    </section>
  </AppShell>;
}
