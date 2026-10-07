import {financeQueryScope,FINANCE_FILTER_KEYS} from "@/lib/finance/filters";
import { revenueFamily } from "@/lib/finance/revenue-family";
import ExcelJS from "exceljs";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions/effective";

export const runtime = "nodejs";
const LIMIT = 10000;
function safeText(value: string | null | undefined) {
  const clean = (value ?? "").replace(/[\r\n\t]+/g, " ");
  return /^\s*[=+\-@]/.test(clean) ? `'${clean}` : clean;
}
function precise(value: bigint): number | string {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : value.toString();
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return new Response("Требуется вход.", { status: 401 });
  if (!await hasPermission(session, "REPORT_FINANCE_VIEW")) return new Response("Недостаточно прав.", { status: 403 });
  const params=new URL(request.url).searchParams;
  let context;try{context=await financeQueryScope(session,Object.fromEntries(FINANCE_FILTER_KEYS.map(key=>[key,params.get(key)||undefined])),"REPORT_FINANCE_VIEW");}catch(error){return new Response(error instanceof Error?error.message:"Нет доступа.",{status:400});}
  const {visibility,where,period:{from,endExclusive}}=context;
  if(!visibility.hasRows)return new Response("Нет разрешённых видов операций.",{status:403});
  const rows = await db.financialTransaction.findMany({
    where,
    select: {
      id: true, occurredAt: true, kind: true, currency: true, amountMinor: true, ...visibility.fields, reason: true,
      sourceType: true, sourceId: true, orderId: true,
      reversalOf: { select: { kind: true, sourceType: true, sourceId: true, orderId: true, order: { select: { type: true } } } },
      branch: { select: { name: true } }, order: { select: { orderNumber: true, type: true } },
      paymentMethod: { select: { displayName: true } }, actorUser: { select: { displayName: true } }
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: LIMIT + 1
  });
  if (rows.length > LIMIT) return new Response("Более 10000 операций. Выберите более короткий период.", { status: 413 });
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Операции"), totals = workbook.addWorksheet("Итоги");
  const visibleColumns: Record<string, boolean> = { sale: visibility.revenue, revenue: visibility.revenue, cash: Boolean(visibility.fields.cashEffectMinor), deposit: visibility.deposits, obligation: visibility.obligation };
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
  const byCurrency = new Map<string, { count: number; sale: bigint; revenue: bigint; cash: bigint; deposit: bigint; obligation: bigint }>();
  for (const row of rows) {
    sheet.addRow({
      date: row.occurredAt, kind: row.kind, branch: safeText(row.branch.name), order: safeText(row.order?.orderNumber),
      method: safeText(row.paymentMethod?.displayName), amount: precise(row.amountMinor), ...(allowedColumn("revenue") ? { revenue: precise(row.revenueEffectMinor ?? BigInt(0)) } : {}),
      ...(allowedColumn("cash") ? { cash: precise(row.cashEffectMinor ?? BigInt(0)) } : {}), ...(allowedColumn("deposit") ? { deposit: precise(row.depositEffectMinor ?? BigInt(0)) } : {}), ...(allowedColumn("obligation") ? { obligation: precise(row.obligationEffectMinor ?? BigInt(0)) } : {}),
      currency: row.currency, actor: safeText(row.actorUser?.displayName), reason: safeText(row.reason), id: row.id
    });
    const total = byCurrency.get(row.currency) ?? { count: 0, sale: BigInt(0), revenue: BigInt(0), cash: BigInt(0), deposit: BigInt(0), obligation: BigInt(0) };
    total.count++; total.revenue += allowedColumn("revenue") ? row.revenueEffectMinor ?? BigInt(0) : BigInt(0); total.cash += allowedColumn("cash") ? row.cashEffectMinor ?? BigInt(0) : BigInt(0);
    total.deposit += allowedColumn("deposit") ? row.depositEffectMinor ?? BigInt(0) : BigInt(0); total.obligation += allowedColumn("obligation") ? row.obligationEffectMinor ?? BigInt(0) : BigInt(0);
    if (visibility.revenue && revenueFamily(row) === "SALE") total.sale += row.revenueEffectMinor ?? BigInt(0);
    byCurrency.set(row.currency, total);
  }
  totals.columns = [
    { header: "Валюта", key: "currency", width: 15 }, { header: "Операций", key: "count", width: 16 },
    { header: "Начислено", key: "revenue", width: 22 }, { header: "Движение денег", key: "cash", width: 23 },
    { header: "Изменение залогов", key: "deposit", width: 24 }, { header: "Изменение долга", key: "obligation", width: 23 },
    { header: "В том числе начисления продажи", key: "sale", width: 36 }
  ].filter(column => allowedColumn(column.key));
  for (const [currency, row] of [...byCurrency].sort(([a], [b]) => a.localeCompare(b))) totals.addRow({
    currency, count: row.count, ...(visibility.revenue ? { sale: precise(row.sale) } : {}), ...(allowedColumn("revenue") ? { revenue: precise(row.revenue) } : {}), ...(allowedColumn("cash") ? { cash: precise(row.cash) } : {}), ...(allowedColumn("deposit") ? { deposit: precise(row.deposit) } : {}), ...(allowedColumn("obligation") ? { obligation: precise(row.obligation) } : {})
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
  if (visibility.revenue) totals.getColumn("sale").numFmt = "#,##0";
  const scope = workbook.addWorksheet("Область отчёта");
  scope.addRow(["Итоги относятся только к доступным видам операций и филиалам; это изменения за период, не полное сальдо."]);
  if (visibility.revenue) scope.addRow(["Начисления продажи входят в колонку «Начислено», с учётом скидок и исправлений. Не прибавляйте их к итогу повторно. Это не оплаты или залоги."]);
  scope.addRow(["Период UTC", from.toISOString(), endExclusive.toISOString()]);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(bytes), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="mariposa-finance-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    "Cache-Control": "private, no-store"
  } });
}
