import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { getCashJournal, JOURNAL_GROUP_LABELS, type CashJournalRaw } from "@/lib/finance/cash-journal";
import { ACCOUNT_LABELS, ACCOUNT_OPERATION_LABELS } from "@/lib/finance/cash-accounts";
import { formatBusinessDateTime, localDateKey } from "@/lib/calendar/timezone";
import "./journal.css";

export default async function Page({ searchParams }: { searchParams: Promise<CashJournalRaw> }) {
  const actor = await requireRouteAccess("/cash/accounts");
  let data: Awaited<ReturnType<typeof getCashJournal>>;
  try { data = await getCashJournal(actor, await searchParams); }
  catch (error) { return <AppShell active="/cash" title="Журнал кассы" subtitle="Итоги не рассчитаны"><p role="alert">{error instanceof Error ? error.message : "Журнал недоступен."}</p><Link href="/cash/accounts/journal">Сбросить фильтры</Link><p><Link href="/cash/accounts">К счетам кассы</Link></p></AppShell>; }
  const { branch, account, filters, period } = data;
  const money = (amount: bigint) => `${amount.toLocaleString("ru-KZ")} ${account?.currency ?? "KZT"}`;
  const date = (at: Date) => formatBusinessDateTime(at, branch.timezone);
  const base = { branchId: branch.id, accountId: account?.id ?? "", from: period.fromLabel, until: period.untilLabel };
  const href = (patch: Record<string, string>) => `/cash/accounts/journal?${new URLSearchParams({ ...filters, ...base, ...patch })}`;
  const exactOperation = (row: { id: string; occurredAt: Date }) => `/cash/accounts/journal?${new URLSearchParams({ ...base, from: localDateKey(row.occurredAt, branch.timezone), until: localDateKey(row.occurredAt, branch.timezone), transactionId: row.id })}#transaction-${row.id}`;
  return <AppShell active="/cash" title="Журнал кассы" subtitle={`${branch.name} · ${account ? ACCOUNT_LABELS[account.kind] : "Счёт не задан"}`}>
    <nav className="journal-nav" aria-label="Разделы кассы"><Link href={`/cash/accounts?branchId=${branch.id}`}>← Счета и операции кассы</Link><Link href="/cash">Оплаты заказов</Link></nav>
    <form className="journal-branch"><label>Филиал<select name="branchId" defaultValue={branch.id}>{data.branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button className="secondary">Выбрать филиал</button></form>
    {!account ? <p role="status" className="notice">В выбранном филиале нет учётных касс. Начальный остаток не задан; ноль не предполагается.</p> : <>
      <form className="card journal-filters" method="get"><input type="hidden" name="branchId" value={branch.id}/>
        <label>Счёт<select name="accountId" defaultValue={account.id}>{data.accounts.map(row => <option value={row.id} key={row.id}>{ACCOUNT_LABELS[row.kind]} · {row.currency}</option>)}</select></label>
        <label>С даты<input type="date" name="from" defaultValue={period.fromLabel} required/></label><label>По дату включительно<input type="date" name="until" defaultValue={period.untilLabel} required/></label>
        <label>Категория расхода<select name="categoryId" defaultValue={filters.categoryId ?? ""}><option value="">Все категории</option>{data.categories.map(row => <option key={row.id} value={row.id}>{row.name}{row.isActive ? "" : " (архив)"}</option>)}</select></label>
        <label>Операция<select name="kind" defaultValue={filters.kind ?? ""}><option value="">Все доступные</option>{[...data.kinds, "REVERSAL" as const].map(kind => <option key={kind} value={kind}>{ACCOUNT_OPERATION_LABELS[kind] ?? kind}</option>)}</select></label>
        <label>Движение<select name="direction" defaultValue={filters.direction ?? ""}><option value="">Все</option><option value="in">Поступление</option><option value="out">Списание</option></select></label>
        <label className="journal-search">Поиск<input name="q" defaultValue={filters.q ?? ""} maxLength={100} placeholder={data.canOrder ? "Заказ, основание, категория или ID операции" : "Основание, категория или ID операции"}/></label>
        <button className="secondary">Показать</button><Link href={`/cash/accounts/journal?${new URLSearchParams(base)}`}>Очистить фильтры журнала</Link>
      </form>
      <p className="journal-note">Период и время записей — {branch.timezone}. Остатки относятся ко всему счёту за период; категория, поиск и вид операции уточняют только журнал ниже.</p>
      {data.summary ? <section className="card journal-summary"><h2>Движение по счёту за период</h2><dl>
        <div><dt>Остаток на начало</dt><dd>{data.summary.begin === null ? "Не задан" : money(data.summary.begin)}</dd></div>
        <div><dt>Поступления на счёт</dt><dd>{money(data.summary.incoming)}</dd></div>
        <div><dt>Списания со счёта</dt><dd>{money(data.summary.outgoing)}</dd></div>
        <div><dt>Остаток на конец</dt><dd>{data.summary.end === null ? "Не задан" : money(data.summary.end)}</dd></div>
      </dl>{data.summary.begin === null && <p className="notice">{data.summary.openingAt && data.summary.openingAt < period.endExclusive ? `Учёт начат внутри периода: ${date(data.summary.openingAt)}. Задание остатка включено в поступления; остаток до начала учёта неизвестен.` : "На выбранный период начальный остаток ещё не задан. Денежные записи не заменяют проверенный начальный остаток."}</p>}
        {data.summary.begin !== null && data.summary.end !== null && <p>Начало + поступления − списания = конец. Учитываются все проводки, включая исходные и обратные записи.</p>}
        <details><summary>Из чего сложились поступления и списания</summary>{data.summary.groups.length ? <div className="journal-breakdown"><table><thead><tr><th>Группа</th><th>Поступления</th><th>Списания</th></tr></thead><tbody>{data.summary.groups.map(row => <tr key={row.key}><td>{JOURNAL_GROUP_LABELS[row.key]}</td><td>{money(row.incoming)}</td><td>{money(row.outgoing)}</td></tr>)}</tbody></table></div> : <p>За период движений по счёту нет.</p>}</details>
      </section> : <p role="status" className="notice">Полные остатки и обороты периода недоступны: нужны права просмотра платежей, залогов и зарплатного учёта. Ниже только разрешённые записи; их суммы не являются остатком счёта.</p>}
      <p className="journal-note">Залог не является выручкой. Перевод между своими кассами не является доходом или расходом бизнеса. Исправление добавляет обратную запись и сохраняет исходную историю.</p>
      {(data.unassigned ?? 0) > 0 && <p className="notice">В филиале за период есть {data.unassigned} доступных денежных записей без привязки к кассе. Они не входят в этот журнал и остатки счёта.</p>}
      <section className="card"><h2>Журнал выбранной кассы</h2>{filters.transactionId && <p>Выбрана точная операция. <Link href={href({ transactionId: "", page: "1" })}>Показать все записи периода</Link></p>}
        <p>Всего доступных записей по фильтрам: {data.total}. Показаны {data.first}–{data.last}; страница {data.page} из {data.pages}.</p>
        <p className="journal-note">По всей отфильтрованной выборке: поступления {money(data.filteredFlow!.incoming)}, списания {money(data.filteredFlow!.outgoing)}. Это не итог текущей страницы.</p>
        {!data.rows?.length ? <p role="status">Доступных операций по выбранным условиям нет.</p> : <div className="journal-table-wrap"><table className="journal-table"><thead><tr><th>Дата / операция</th><th>Категория / основание</th><th>Изменение счёта</th><th>Связанные записи</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id} id={`transaction-${row.id}`}>
          <td data-label="Дата / операция"><strong>{ACCOUNT_OPERATION_LABELS[row.kind] ?? "Движение по счёту"}</strong><small>{date(row.occurredAt)}</small>{row.reversalOf && <small>Исправление: {ACCOUNT_OPERATION_LABELS[row.reversalOf.kind] ?? "операция"}</small>}</td>
          <td data-label="Категория / основание">{row.expenseCategoryName ?? row.reversalOf?.expenseCategoryName ?? "Без категории расхода"}<small>{row.reason || "Основание не указано"}</small><small>{row.actorUser?.displayName ?? "Система"}{row.employee ? ` · ${row.employee.user.displayName}` : ""}</small>{row.paymentMethod && <small>{row.paymentMethod.displayName}</small>}</td>
          <td data-label="Изменение счёта" className="journal-money"><strong>{row.accountEffectMinor > BigInt(0) ? "+" : ""}{money(row.accountEffectMinor)}</strong>{row.kind.includes("TRANSFER") && <small>Внутренний перевод</small>}{row.reversal && <small>Есть обратная запись; исходная сохранена</small>}</td>
          <td data-label="Связанные записи">{row.order && <Link href={`/orders/${row.order.id}`}>Заказ {row.order.orderNumber}</Link>}{row.reversalOf?.cashAccountId === account.id && <Link href={exactOperation(row.reversalOf)}>Исходная операция</Link>}{row.reversal?.cashAccountId === account.id && <Link href={exactOperation(row.reversal)}>Обратная запись</Link>}<details><summary>ID операции</summary><code>{row.id}</code></details></td>
        </tr>)}</tbody></table></div>}
        <nav className="journal-nav" aria-label="Страницы журнала">{data.page! > 1 && <Link href={href({ page: String(data.page! - 1) })}>← Назад</Link>}{data.page! < data.pages! && <Link href={href({ page: String(data.page! + 1) })}>Далее →</Link>}</nav>
      </section>
    </>}
  </AppShell>;
}
