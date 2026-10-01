import { financeReadVisibility } from "@/lib/finance/read-visibility";
import ExcelJS from "exceljs";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions/effective";
import { accessibleBranchIds } from "@/lib/staff/branch-access";
import { createTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
const LIMIT = 10000;
const DAY = 24 * 60 * 60 * 1000;
function safeText(value: string | null | undefined) {
  const clean = (value ?? "").replace(/[\r\n\t]+/g, " ");
  return /^\s*[=+\-@]/.test(clean) ? `'${clean}` : clean;
}
function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}
function precise(value: bigint): number | string {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : value.toString();
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return new Response("Требуется вход.", { status: 401 });
  if (!await hasPermission(session, "REPORT_FINANCE_VIEW")) return new Response("Недостаточно прав.", { status: 403 });
  const visibility = await financeReadVisibility(session);
  if (!visibility.hasRows) return new Response("Нет прав на просмотр видов финансовых операций.", { status: 403 });
  const params = new URL(request.url).searchParams;
  const fromParam = params.get("from"), untilParam = params.get("until");
  if (Boolean(fromParam) !== Boolean(untilParam)) return new Response("Укажите обе даты периода.", { status: 400 });
  const from = fromParam ? parseDay(fromParam) : new Date(Date.now() - 30 * DAY);
  const until = untilParam ? parseDay(untilParam) : new Date();
  if (!from || !until || until.getTime() < from.getTime() || until.getTime() - from.getTime() > 366 * DAY) return new Response("Некорректный период: максимум 366 дней.", { status: 400 });
  const endExclusive = untilParam ? new Date(until.getTime() + DAY) : until;
  const branchIds = await accessibleBranchIds(createTenantContext(session.organizationId), session.membershipId);
  const rows = await db.financialTransaction.findMany({
    where: { organizationId: session.organizationId, branchId: branchIds ? { in: branchIds } : undefined, occurredAt: { gte: from, lt: endExclusive }, ...visibility.where },
    select: {
      id: true, occurredAt: true, kind: true, currency: true, amountMinor: true, ...visibility.fields, reason: true,
      branch: { select: { name: true } }, order: { select: { orderNumber: true } },
      paymentMethod: { select: { displayName: true } }, actorUser: { select: { displayName: true } }
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: LIMIT + 1
  });
  if (rows.length > LIMIT) return new Response("Более 10000 операций. Выберите более короткий период.", { status: 413 });
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Операции"), totals = workbook.addWorksheet("Итоги");
  const visibleColumns: Record<string, boolean> = { revenue: visibility.revenue, cash: Boolean(visibility.fields.cashEffectMinor), deposit: visibility.deposits, obligation: visibility.obligation };
  const allowedColumn = (key: string) => visibleColumns[key] !== false;
  sheet.columns = [
    { header: "Дата UTC", key: "date", width: 23 }, { header: "Вид операции", key: "kind", width: 26 },
    { header: "Филиал", key: "branch", width: 27 }, { header: "Заказ", key: "order", width: 22 },
    { header: "Способ оплаты", key: "method", width: 24 }, { header: "Сумма операции", key: "amount", width: 21 },
    { header: "Начислено", key: "revenue", width: 19 }, { header: "Движение денег", key: "cash", width: 20 },
    { header: "Изменение залога", key: "deposit", width: 22 }, { header: "Изменение долга", key: "obligation", width: 21 },
    { header: "Валюта", key: "currency", width: 13 }, { header: "Сотрудник", key: "actor", width: 27 },
    { header: "Причина", key: "reason", width: 45 }, { header: "ID операции", key: "id", width: 40 }
  ].filter(column => allowedColumn(column.key));
  const byCurrency = new Map<string, { count: number; revenue: bigint; cash: bigint; deposit: bigint; obligation: bigint }>();
  for (const row of rows) {
    sheet.addRow({
      date: row.occurredAt, kind: row.kind, branch: safeText(row.branch.name), order: safeText(row.order?.orderNumber),
      method: safeText(row.paymentMethod?.displayName), amount: precise(row.amountMinor), ...(allowedColumn("revenue") ? { revenue: precise(row.revenueEffectMinor ?? BigInt(0)) } : {}),
      ...(allowedColumn("cash") ? { cash: precise(row.cashEffectMinor ?? BigInt(0)) } : {}), ...(allowedColumn("deposit") ? { deposit: precise(row.depositEffectMinor ?? BigInt(0)) } : {}), ...(allowedColumn("obligation") ? { obligation: precise(row.obligationEffectMinor ?? BigInt(0)) } : {}),
      currency: row.currency, actor: safeText(row.actorUser?.displayName), reason: safeText(row.reason), id: row.id
    });
    const total = byCurrency.get(row.currency) ?? { count: 0, revenue: BigInt(0), cash: BigInt(0), deposit: BigInt(0), obligation: BigInt(0) };
    total.count++; total.revenue += allowedColumn("revenue") ? row.revenueEffectMinor ?? BigInt(0) : BigInt(0); total.cash += allowedColumn("cash") ? row.cashEffectMinor ?? BigInt(0) : BigInt(0);
    total.deposit += allowedColumn("deposit") ? row.depositEffectMinor ?? BigInt(0) : BigInt(0); total.obligation += allowedColumn("obligation") ? row.obligationEffectMinor ?? BigInt(0) : BigInt(0);
    byCurrency.set(row.currency, total);
  }
  totals.columns = [
    { header: "Валюта", key: "currency", width: 15 }, { header: "Операций", key: "count", width: 16 },
    { header: "Начислено", key: "revenue", width: 22 }, { header: "Движение денег", key: "cash", width: 23 },
    { header: "Изменение залогов", key: "deposit", width: 24 }, { header: "Изменение долга", key: "obligation", width: 23 }
  ].filter(column => allowedColumn(column.key));
  for (const [currency, row] of [...byCurrency].sort(([a], [b]) => a.localeCompare(b))) totals.addRow({
    currency, count: row.count, ...(allowedColumn("revenue") ? { revenue: precise(row.revenue) } : {}), ...(allowedColumn("cash") ? { cash: precise(row.cash) } : {}), ...(allowedColumn("deposit") ? { deposit: precise(row.deposit) } : {}), ...(allowedColumn("obligation") ? { obligation: precise(row.obligation) } : {})
  });
  for (const page of [sheet, totals]) {
    page.getRow(1).font = { bold: true };
    page.views = [{ state: "frozen", ySplit: 1 }];
    page.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: page.columns.length } };
  }
  sheet.getColumn("date").numFmt = "dd.mm.yyyy hh:mm";
  for (const column of ["amount", "revenue", "cash", "deposit", "obligation"]) {
    if (!allowedColumn(column)) continue;
    sheet.getColumn(column).numFmt = "#,##0";
    if (column !== "amount") totals.getColumn(column).numFmt = "#,##0";
  }
  const scope = workbook.addWorksheet("Область отчёта");
  scope.addRow(["Итоги относятся только к доступным видам операций и филиалам; это изменения за период, не полное сальдо."]);
  scope.addRow(["Период UTC", from.toISOString(), endExclusive.toISOString()]);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(bytes), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="mariposa-finance-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    "Cache-Control": "private, no-store"
  } });
}
