import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { getFinanceDashboard } from "@/lib/finance/dashboard";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";

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

  return <AppShell active="/finance" title="Финансы" subtitle="Начисления и денежные операции из заказов">
    <p className="finance-help">Показатели за последние {data.windowDays} дней. Начисления, движение денег и залоги показаны отдельно; это не расчёт прибыли.</p>
    <div className="finance-summary">
      {data.totals.map(row => <section className="card finance-summary-card" key={row.currency}>
        <h2>{row.currency}</h2>
        <dl>
          <div><dt>Начислено</dt><dd>{money(row._sum.revenueEffectMinor ?? BigInt(0), row.currency)}</dd></div>
          <div><dt>Движение денег</dt><dd>{money(row._sum.cashEffectMinor ?? BigInt(0), row.currency)}</dd></div>
          <div><dt>Изменение залогов</dt><dd>{money(row._sum.depositEffectMinor ?? BigInt(0), row.currency)}</dd></div>
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
            {row.orderId && row.order && <Link href={`/orders/${row.orderId}`}>{row.order.orderNumber} →</Link>}
          </div>
        </div>)}
        {!data.recent.length && <p>Операций пока нет.</p>}
      </div>
    </section>
  </AppShell>;
}
