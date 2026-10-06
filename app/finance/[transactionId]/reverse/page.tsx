import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { getReversalTarget } from "@/lib/finance/reversal-workflow";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
import { reverseFinancialTransactionAction } from "../../actions";
import "../../reversal.css";

const labels: Record<string, string> = {
  RENTAL_CHARGE: "Начисление аренды", SALE_CHARGE: "Начисление продажи",
  DAMAGE_CHARGE: "Начисление ущерба", DISCOUNT: "Скидка", PAYMENT_RECEIVED: "Полученная оплата",
  CUSTOMER_REFUND: "Возврат клиенту", DEPOSIT_RECEIVED: "Принятый залог",
  DEPOSIT_REFUNDED: "Возвращённый залог", DEPOSIT_WITHHELD: "Удержание залога",
};

export default async function ReversePage({ params, searchParams }: {
  params: Promise<{ transactionId: string }>; searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRouteAccess("/finance");
  if (!await hasPermission(session, "PAYMENT_REVERSE")) notFound();
  const [{ transactionId }, query] = await Promise.all([params, searchParams]);
  const row = await getReversalTarget(session, transactionId);
  if (!row) notFound();
  return <AppShell active="/finance" title="Исправить финансовую операцию">
    <section className="card">
      <p><strong>{labels[row.kind] ?? row.kind}</strong> · {row.amountMinor.toLocaleString("ru-KZ")} {row.currency}</p>
      <p>{row.branch.name} · {formatBusinessDateTime(row.occurredAt, row.branch.timezone)}</p>
      {row.order && <p>Заказ <Link href={`/orders/${row.order.id}`}>{row.order.orderNumber}</Link></p>}
      <p>Исходная запись сохраняется. Исправление создаёт обратную запись и фиксирует причину в аудите.</p>
      <p>Это исправление ошибочной записи, а не возврат денег клиенту. Оно может изменить задолженность и остаток залога, в том числе у уже выданного заказа. Физическая выдача и возврат товара не отменяются.</p>
      {query.error && <p className="form-error" role="alert">{query.error}</p>}
      {row.reversal ? <p className="notice">Операция уже исправлена. Повторное исправление не создаётся.</p> :
        <form action={reverseFinancialTransactionAction} className="finance-reversal-form">
          <input type="hidden" name="transactionId" value={row.id}/>
          <input type="hidden" name="idempotencyKey" value={randomUUID()}/>
          <label className="finance-reversal-reason">Причина исправления<textarea name="reason" minLength={3} maxLength={500} required/></label>
          <label className="finance-reversal-confirm"><input type="checkbox" name="confirmed" value="yes" required/> Я проверил последствия исправления для оплаты, задолженности и залога.</label>
          <button className="danger" type="submit">Создать исправление</button>
        </form>}
      <p><Link href="/finance">Вернуться к финансовым операциям</Link></p>
    </section>
  </AppShell>;
}
