import {ContextPanel} from "@/components/ContextPanel";
import {WorkflowTabs} from "@/components/WorkflowTabs";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { RetainedActionForm } from "@/components/RetainedActionForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { payrollView, CLAIM_LABELS, PAYROLL_LABELS } from "@/lib/payroll/service";
import { PAYMENT_CHANNEL_LABELS, paymentChannel } from "@/lib/finance/payment-channel";
import { rateAction, confirmPayrollAction, rejectPayrollAction, manualPayrollAction, correctPayrollAction } from "./actions";
type Filters = { branchId?: string; employeeMembershipId?: string; all?: string; page?: string; saved?: string };
const money = (value: bigint, currency: string) => `${value.toLocaleString("ru-KZ")} ${currency}`;
export default async function Page({ searchParams }: { searchParams: Promise<Filters> }) {
  const actor = await requireRouteAccess("/payroll"), filters = await searchParams;
  let data: Awaited<ReturnType<typeof payrollView>>;
  try { data = await payrollView(actor, filters); }
  catch (error) { return <AppShell active="/payroll" title="Зарплата"><p role="alert">{error instanceof Error ? error.message : "Раздел недоступен."}</p><Link href="/payroll">Открыть заново</Link></AppShell>; }
  const selected = data.selected;
  const context = <><input type="hidden" name="branchId" value={data.branch.id}/><input type="hidden" name="employeeMembershipId" value={selected?.id ?? ""}/></>;
  const methods = data.methods.map(m => <option key={m.id} value={m.id}>{m.displayName} · {PAYMENT_CHANNEL_LABELS[paymentChannel(m.code)]}</option>);
  const pageLink = (page: number) => `/payroll?${new URLSearchParams({ branchId: data.branch.id, employeeMembershipId: selected?.id ?? "", all: filters.all ?? "", page: String(page) })}`;
  return <AppShell active="/payroll" title="Зарплата" subtitle="Отработанные смены и расчёт с сотрудниками">
    <WorkflowTabs active="/payroll" items={[{href:"/schedule",label:"График"},{href:"/my-shifts",label:"Мои смены"},{href:"/payroll",label:"Подтверждение и выплаты"}]}/>
    {filters.saved === "1" && <p role="status" className="notice">Операция сохранена.</p>}
    <form className="card form-grid payroll-filters"><label>Филиал<select name="branchId" defaultValue={data.branch.id}>{data.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>Сотрудник<select name="employeeMembershipId" defaultValue={selected?.id ?? ""}><option value="">Все отметки филиала</option>{data.members.map(m => <option key={m.id} value={m.id}>{m.user.displayName}{m.status !== "ACTIVE" ? " (неактивен)" : ""}</option>)}</select></label>
      <label><input name="all" type="checkbox" value="yes" defaultChecked={filters.all === "yes"}/> Показать обработанные отметки</label><button className="secondary">Показать</button>
    </form>
    {selected && <section className="card payroll-employee"><h2>{selected.user.displayName} · {data.branch.name}</h2>
      <div className="payroll-balances">{data.balances.map(row => <p key={row.currency}><strong>{row.currency}</strong> · Начислено: {money(row.accrued, row.currency)} · Выплачено: {money(row.paid, row.currency)} · Остаток: {money(row.due, row.currency)}</p>)}{!data.balances.length && <p>Начислено: 0 · Выплачено: 0 · Остаток: 0</p>}</div>
      <ContextPanel title="Ставка сотрудника" trigger={data.rate?"Изменить ставку":"Задать ставку"}><p>За полную обычную смену в {data.branch.name}. Новая ставка действует только для будущих подтверждений.</p>
      {data.canRate && selected.status === "ACTIVE" ? <RetainedActionForm action={rateAction} className="form-grid payroll-rate-form">{context}<input type="hidden" name="version" value={data.rate?.version ?? 0}/>
        <label>Будни · {data.currency}<input name="weekdayMinor" inputMode="numeric" pattern="[1-9][0-9]*" maxLength={12} defaultValue={data.rate?.weekdayMinor.toString() ?? ""} required/></label>
        <label>Выходные · {data.currency}<input name="weekendMinor" inputMode="numeric" pattern="[1-9][0-9]*" maxLength={12} defaultValue={data.rate?.weekendMinor.toString() ?? ""} required/></label><button className="secondary">Сохранить ставки</button>
      </RetainedActionForm> : <p>{data.rate ? `Будни: ${money(data.rate.weekdayMinor, data.rate.currency)}; выходные: ${money(data.rate.weekendMinor, data.rate.currency)}` : "Ставки не заданы."}</p>}
    </ContextPanel></section>}
    <section className="payroll-claims"><h2>Отметки сотрудников</h2>
      {data.claims.map(claim => <article className="card payroll-claim" data-claim-id={claim.id} key={claim.id}>
        <h3>{claim.employee.user.displayName} · {claim.workDate.toISOString().slice(0, 10)}</h3><p>{CLAIM_LABELS[claim.status]} · {claim.timezone}</p>
        {claim.status === "SUBMITTED" ? <><p>{claim.category === "WEEKEND" ? "Выходной" : "Будний день"} · Начисление и выплата: <strong>{claim.previewAmount !== null ? money(claim.previewAmount, claim.previewCurrency!) : "Ставка не задана"}</strong></p>
          {data.canConfirm && claim.currentRateVersion && data.methods.length ? <ContextPanel title="Подтвердить смену и выплату" trigger="Подтвердить и выплатить" primary><p>{claim.employee.user.displayName} · {claim.workDate.toISOString().slice(0,10)} · {claim.previewAmount !== null ? money(claim.previewAmount,claim.previewCurrency!) : "Ставка не задана"}</p><p>Будут записаны начисление и уже выданная сумма. Банковского перевода нет.</p><RetainedActionForm action={confirmPayrollAction} className="form-grid payroll-confirm-form">
            <input type="hidden" name="branchId" value={data.branch.id}/><input type="hidden" name="employeeMembershipId" value={claim.employeeMembershipId}/><input type="hidden" name="id" value={claim.id}/><input type="hidden" name="version" value={claim.version}/><input type="hidden" name="rateVersion" value={claim.currentRateVersion}/><input type="hidden" name="idempotencyKey" value={randomUUID()}/>
            <label>Как выданы деньги<select name="paymentMethodId" defaultValue="" required><option value="" disabled>Выберите способ</option>{methods}</select></label>
            <label><input type="checkbox" name="confirmed" value="yes" required/> Полная обычная смена проверена; указанная сумма уже выдана сотруднику.</label><button className="primary">Подтвердить смену и выплату</button>
          </RetainedActionForm></ContextPanel> : <p>{!claim.currentRateVersion?"Сначала задайте ставку сотруднику.":!data.methods.length?"Добавьте активный способ выплаты в настройках.":"Нет права подтверждать выплаты."} <Link href={`/payroll?branchId=${data.branch.id}&employeeMembershipId=${claim.employeeMembershipId}`}>{!claim.currentRateVersion?"Задать ставку":"Открыть сотрудника"}</Link></p>}
          {data.canReject && <details><summary>Отклонить отметку</summary><RetainedActionForm action={rejectPayrollAction} className="form-grid payroll-reject-form">{context}<input type="hidden" name="id" value={claim.id}/><input type="hidden" name="version" value={claim.version}/><label>Причина для сотрудника<textarea name="reason" minLength={3} maxLength={500} required/></label><button className="secondary">Отклонить</button></RetainedActionForm></details>}
        </> : <>{claim.approvalSnapshot && <p>Сохранённая сумма: {String((claim.approvalSnapshot as Record<string, unknown>).rateMinor)} {String((claim.approvalSnapshot as Record<string, unknown>).currency)} · {String((claim.approvalSnapshot as Record<string, unknown>).paymentMethodName)}</p>}{claim.decisionReason && <p>Причина: {claim.decisionReason}</p>}</>}
      </article>)}{!data.claims.length && <p className="card">Отметок по выбранным условиям нет.</p>}
      <nav className="toolbar" aria-label="Страницы отметок">{data.page > 1 && <Link href={pageLink(data.page - 1)}>Назад</Link>}<span>Страница {data.page}</span>{data.more && <Link href={pageLink(data.page + 1)}>Далее</Link>}</nav>
    </section>
    {selected && (data.canBonus || data.canPayout) && <section className="card"><h2>Премия и отдельная выплата</h2>
      {data.canBonus && <details><summary>Начислить отдельную премию</summary><RetainedActionForm action={manualPayrollAction} className="form-grid payroll-bonus-form">{context}<input type="hidden" name="kind" value="PAYROLL_BONUS"/><input type="hidden" name="currency" value={data.currency}/><input type="hidden" name="idempotencyKey" value={randomUUID()}/><label>Премия · {data.currency}<input name="amountMinor" inputMode="numeric" pattern="[1-9][0-9]*" maxLength={12} required/></label><label>Основание премии<textarea name="reason" minLength={3} maxLength={500} required/></label><label><input type="checkbox" name="confirmed" value="yes" required/> Премия согласована; это начисление, выплата оформляется отдельно.</label><button className="secondary">Начислить премию</button></RetainedActionForm></details>}
      {data.canPayout && <details><summary>Записать выплату остатка</summary><p>Только уже выданные деньги в пределах остатка. Подтверждённую оплату смены повторно выплачивать не нужно.</p><RetainedActionForm action={manualPayrollAction} className="form-grid payroll-payout-form">{context}<input type="hidden" name="kind" value="PAYROLL_PAYOUT"/><input type="hidden" name="idempotencyKey" value={randomUUID()}/><label>Валюта<select name="currency" required defaultValue=""><option value="" disabled>Выберите остаток</option>{data.balances.filter(row => row.due > BigInt(0)).map(row => <option key={row.currency} value={row.currency}>{row.currency} · остаток {row.due.toString()}</option>)}</select></label><label>Выданная сумма<input name="amountMinor" inputMode="numeric" pattern="[1-9][0-9]*" maxLength={12} required/></label><label>Способ выплаты<select name="paymentMethodId" required defaultValue=""><option value="" disabled>Выберите способ</option>{methods}</select></label><label>Основание<textarea name="reason" minLength={3} maxLength={500} required/></label><label><input name="confirmed" type="checkbox" value="yes" required/> Деньги уже выданы сотруднику.</label><button className="secondary">Записать выплату</button></RetainedActionForm></details>}
    </section>}
    {selected && <section className="card payroll-ledger"><h2>История начислений и выплат</h2><p>Последние 100 записей. Итоги выше рассчитаны по всей истории сотрудника в этом филиале. Удаления нет; исправление не выполняет реальный возврат денег.</p>
      {data.ledger.map(row => <article className="payroll-row" key={row.id}><strong>{PAYROLL_LABELS[row.kind]} · {money(row.amountMinor, row.currency)}</strong><p>{row.occurredAt.toISOString()} · {row.paymentMethod?.displayName ?? "Без выплаты"}</p><p>{row.reason}</p>
        {row.reversal ? <p>Исправлено обратной записью</p> : row.kind !== "REVERSAL" && data.canReverse ? <details><summary>Исправить ошибочную запись</summary><p>{row.sourceType === "PAYROLL_SHIFT_CONFIRMATION" ? "Начисление и выплата этой смены будут исправлены вместе. Сотрудник сможет подать новую отметку." : "Будет создана обратная запись с сохранением истории."}</p><RetainedActionForm action={correctPayrollAction} className="form-grid payroll-correct-form">{context}<input type="hidden" name="transactionId" value={row.id}/><input type="hidden" name="idempotencyKey" value={randomUUID()}/><label>Причина<textarea name="reason" minLength={3} maxLength={500} required/></label><label><input name="confirmed" type="checkbox" value="yes" required/> Это исправление учётной ошибки; движение денег проверено отдельно.</label><button className="secondary">Создать исправление</button></RetainedActionForm></details> : null}
      </article>)}{!data.ledger.length && <p>Записей нет.</p>}
    </section>}
  </AppShell>;
}
