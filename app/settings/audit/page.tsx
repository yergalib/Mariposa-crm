import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { createTenantContext } from "@/lib/tenant/context";
import { AuditLogFilterError, auditLogPageHref, getAuditLogPage, readAuditLogFilters, type AuditLogFilters } from "@/lib/audit/view";

const results = { SUCCESS: "Успешно", DENIED: "Отказано", FAILED: "Ошибка" };
const sources = { CRM: "CRM", API: "API", SYSTEM: "Система" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRouteAccess("/settings/audit");
  await requirePermission(session, "AUDIT_LOG_VIEW");
  let filters: AuditLogFilters = {}, data, error;
  try {
    filters = readAuditLogFilters(await searchParams);
    data = await getAuditLogPage(createTenantContext(session.organizationId), session, filters);
  } catch (cause) {
    if (!(cause instanceof AuditLogFilterError)) throw cause;
    error = cause.message;
  }
  return <AppShell active="/settings" title="Журнал действий" subtitle="Сохранённые события CRM; время UTC">
    {error && <p className="notice error" role="alert">{error} <Link href="/settings/audit">Начать заново</Link></p>}
    {data && <>
      <form action="/settings/audit" method="get" className="panel form-grid">
        <label>С даты (UTC)<input type="date" name="from" defaultValue={filters.from ?? ""} /></label>
        <label>По дату (UTC)<input type="date" name="to" defaultValue={filters.to ?? ""} /></label>
        <label>Филиал<select name="branchId" defaultValue={filters.branchId ?? ""}><option value="">Все доступные</option>{data.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Действие (точный код)<input name="action" maxLength={120} defaultValue={filters.action ?? ""} placeholder="FINANCIAL_TRANSACTION_POSTED" /></label>
        <label>Тип объекта (точный код)<input name="entityType" maxLength={80} defaultValue={filters.entityType ?? ""} placeholder="Order" /></label>
        <label>Результат<select name="result" defaultValue={filters.result ?? ""}><option value="">Все результаты</option>{Object.entries(results).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Источник<select name="source" defaultValue={filters.source ?? ""}><option value="">Все источники</option>{Object.entries(sources).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className="primary" type="submit">Показать</button><Link href="/settings/audit">Сбросить фильтры</Link>
      </form>
      <section className="panel">
        <p>Показано {data.rows.length} событий, сначала новые. Даты включают выбранные календарные дни UTC. Имена пользователей и филиалов — из текущих справочников.</p>
        {data.rows.length ? <div style={{ overflowX: "auto" }}><table>
          <caption>События журнала</caption><thead><tr><th scope="col">Время UTC</th><th scope="col">Кто</th><th scope="col">Филиал</th><th scope="col">Действие</th><th scope="col">Объект</th><th scope="col">Результат</th><th scope="col">Источник</th></tr></thead>
          <tbody>{data.rows.map(row => <tr key={row.id}>
            <td><time dateTime={row.occurredAt.toISOString()}>{row.occurredAt.toISOString().replace("T", " ").replace("Z", "")}</time></td>
            <td>{row.actorUser?.displayName ?? "Без пользователя"}</td><td>{row.branch?.name ?? "Без филиала"}</td><td><code>{row.action}</code></td>
            <td>{row.entityType}{row.entityId && <small> {row.entityId}</small>}</td><td>{results[row.result]}</td><td>{sources[row.source]}</td>
          </tr>)}</tbody>
        </table></div> : <p>Событий по выбранным фильтрам нет.</p>}
        <nav aria-label="Страницы журнала">
          {filters.cursor && <Link href={auditLogPageHref(filters)}>К первым событиям</Link>}{" "}
          {data.nextCursor && <Link href={auditLogPageHref(filters, data.nextCursor)}>Следующие 50 событий</Link>}
        </nav>
      </section>
    </>}
  </AppShell>;
}
