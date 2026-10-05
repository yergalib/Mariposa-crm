import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { getFinanceDashboard } from "@/lib/finance/dashboard";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
import { hasPermission } from "@/lib/permissions/effective";

const labels = {
  RENTAL_CHARGE: "Начисление аренды",
  SALE_CHARGE: "Начисление продажи",
  DAMAGE_CHARGE: "Начисление за ущерб",
  DISCOUNT: "Скидка",
  PAYMENT_RECEIVED: "Получена оплата",
  CUSTOMER_REFUND: "Возврат клиенту",
  DEPOSIT_RECEIVED: "Получен залог",
  DEPOSIT_REFUNDED: "Залог возвращён",
  DEPOSIT_WITHHELD: "Залог удержан",
  REVERSAL: "Исправление операции",
} as const;

function money(amount: bigint, currency: string) {
  return `${amount.toLocaleString("ru-KZ")} ${currency === "KZT" ? "₸" : currency}`;
}

export default async function FinancePage() {
  const session = await requireRouteAccess("/finance");
  const data = await getFinanceDashboard(createTenantContext(session.organizationId), session);
  const canExport = await hasPermission(session, "REPORT_FINANCE_VIEW");
  const canReverse = await hasPermission(session, "PAYMENT_REVERSE");

  return <AppShell active="/finance" title="Финансы" subtitle="Начисления и денежные операции из заказов">
    <p className="finance-help">Показатели за последние {data.windowDays} дней по доступным вам видам операций. Начисления, движение денег и залоги показаны отдельно; это не расчёт прибыли или полного сальдо.</p>
    {!data.hasVisibleKinds && <p className="notice">Нет прав на просмотр видов финансовых операций.</p>}
    {canExport && <div className="toolbar"><a className="button secondary" href="/finance/export">↓ Excel за последние 30 дней</a><form action="/finance/export" method="get"><label>С <input name="from" type="date" required /></label><label>По <input name="until" type="date" required /></label><button className="secondary" type="submit">Excel за период</button></form></div>}
    <div className="finance-summary">
      {data.totals.map(row => <section className="card finance-summary-card" key={row.currency}>
        <h2>{row.currency}</h2>
        <dl>
          {row._sum.revenueEffectMinor !== undefined && <div><dt>Начислено</dt><dd>{money(row._sum.revenueEffectMinor, row.currency)}</dd></div>}
          {row._sum.cashEffectMinor !== undefined && <div><dt>Движение денег</dt><dd>{money(row._sum.cashEffectMinor, row.currency)}</dd></div>}
          {row._sum.depositEffectMinor !== undefined && <div><dt>Изменение залогов</dt><dd>{money(row._sum.depositEffectMinor, row.currency)}</dd></div>}
        </dl>
        <small>{row._count._all} операций за период</small>
      </section>)}
      {!data.totals.length && <section className="card">За последние {data.windowDays} дней финансовых операций нет.</section>}
    </div>
    <section className="card finance-ledger">
      <div className="section-heading"><div><h2>Последние операции</h2><p>Показаны последние {data.recentLimit} записей финансового журнала.</p></div></div>
      <div className="finance-rows">
        {data.recent.map(row => <div className="finance-row" key={row.id}>
          <div className="finance-row-info">
            <strong>{labels[row.kind]}</strong>
            <span>{formatBusinessDateTime(row.occurredAt, row.branch.timezone)} · {row.branch.name}</span>
            {row.paymentMethod && <span>{row.paymentMethod.displayName}</span>}
          </div>
          <div className="finance-row-amount">
            <strong>{money(row.amountMinor, row.currency)}</strong>
            {canReverse && row.kind !== "REVERSAL" && !row.reversal && <Link href={`/finance/${row.id}/reverse`}>Исправить ошибочную запись</Link>}
            {row.orderId && row.order && <Link href={`/orders/${row.orderId}`}>{row.order.orderNumber} →</Link>}
          </div>
        </div>)}
        {!data.recent.length && <p>Операций пока нет.</p>}
      </div>
    </section>
  </AppShell>;
}
