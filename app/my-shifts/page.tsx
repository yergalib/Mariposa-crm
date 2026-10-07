import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { RetainedActionForm } from "@/components/RetainedActionForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { ownClaims, CLAIM_LABELS } from "@/lib/payroll/service";
import { localDateKey } from "@/lib/calendar/timezone";
import { submitOwnShiftAction } from "@/app/payroll/actions";
export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const actor = await requireRouteAccess("/my-shifts"), query = await searchParams;
  const data = await ownClaims(actor), branch = data.branches.find(b => b.id === actor.defaultBranchId) ?? data.branches[0];
  return <AppShell active="/my-shifts" title="Мои отработанные смены" subtitle="Отметка сотрудника и подтверждение руководителя">
    <p><Link href="/schedule">Плановый график</Link> сам по себе зарплату не начисляет. Отметьте только полностью отработанную обычную смену. Неполные смены, переработка и праздничные дни здесь не рассчитываются.</p>
    {query.saved === "1" && <p className="notice" role="status">Отметка отправлена руководителю. Начисление и запись о выплате появятся только после его подтверждения.</p>}
    {branch ? <RetainedActionForm action={submitOwnShiftAction} className="card form-grid payroll-own-form">
      <input type="hidden" name="creationKey" value={randomUUID()}/>
      <label>Филиал<select name="branchId" defaultValue={branch.id}>{data.branches.map(b => <option key={b.id} value={b.id}>{b.name} · {b.timezone}</option>)}</select></label>
      <label>Дата отработанной смены в филиале<input name="workDate" type="date" defaultValue={localDateKey(new Date(), branch.timezone)} required/></label>
      <label><input name="standardShift" type="checkbox" value="yes" required/> Я полностью отработал обычную смену за эту дату, без переработки и праздничного расчёта.</label>
      <button className="primary">Отправить отметку руководителю</button>
    </RetainedActionForm> : <p>Нет доступного активного филиала.</p>}
    <section className="card payroll-own-history"><h2>Мои отметки</h2><p>Показаны последние 100 отметок. После отклонения или исправления можно отправить новую отметку за ту же дату.</p>
      {data.claims.map(row => <article className="payroll-row" key={row.id}><strong>{row.workDate.toISOString().slice(0, 10)} · {row.branch.name}</strong><p>{CLAIM_LABELS[row.status]}</p>{row.decisionReason && <p>Причина: {row.decisionReason}</p>}</article>)}
      {!data.claims.length && <p>Отметок пока нет.</p>}
    </section>
  </AppShell>;
}
