import "server-only";
import ExcelJS from "exceljs";
import type { PurchaseReport } from "./report";

const safeText = (value: string | null) => {
  const text = (value ?? "").replace(/[\r\n\t]/g, " ");
  return /^\s*[=+\-@]/.test(text) ? "'" + text : text;
};
const exact = (value: bigint | null) => value === null ? null : Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
const labels = { DRAFT: "Черновик", CONFIRMED: "Подтверждена", PARTIALLY_RECEIVED: "Получена частично", RECEIVED: "Получена", CLOSED: "Завершена", CANCELLED: "Отменена" };
export async function purchaseReportWorkbook(report: PurchaseReport) {
  const workbook = new ExcelJS.Workbook();
  const info = workbook.addWorksheet("Об отчёте");
  info.addRows([
    ["Сформирован (UTC)", report.generatedAt.toISOString()],
    ["Отбор", "По дате создания закупки, календарные дни UTC включительно; приёмки за всё время выбранных закупок."],
    ["С даты", report.filters.from ?? "Все даты"], ["По дату", report.filters.to ?? "Все даты"],
    ["Статус", report.filters.status ? labels[report.filters.status] : "Все статусы, включая черновики и отменённые"],
    ["Филиал", report.filters.branchId ?? "Все доступные филиалы"],
    ["Количество", "Заказано / получено по реальным приёмкам / ещё не получено; остаток не означает обязанность принять отменённую или закрытую закупку."],
    ["Стоимость", report.costVisible ? "Минимальные денежные единицы своей валюты. Сумма документов и стоимость фактической приёмки показаны отдельно; это не платежи и не кассовый расход." : "Стоимость недоступна по правам и не включена в отчёт."],
  ]);
  info.getColumn(1).width = 24; info.getColumn(2).width = 110; info.getColumn(2).alignment = { wrapText: true };
  const documents = workbook.addWorksheet("Закупки"), items = workbook.addWorksheet("Позиции"), totals = workbook.addWorksheet("Итоги по статусу");
  const column = (header: string, key: string, width = 22) => ({ header, key, width });
  documents.columns = [column("Номер", "number"), column("Создана (UTC)", "created"), column("Статус", "status"), column("Поставщик", "supplier", 35), column("Филиал", "branch"), column("Валюта", "currency", 12), ...(report.costVisible ? [column("Сумма документа (мин. ед.)", "total", 28)] : [])];
  items.columns = [column("Закупка", "number"), column("Статус", "status"), column("Товар (снимок)", "product", 35), column("Вариант (снимок)", "variant", 30), column("SKU (снимок)", "sku"), column("Валюта", "currency", 12), column("Заказано", "ordered", 14), column("Получено", "received", 14), column("Ещё не получено", "remaining", 20), ...(report.costVisible ? [column("Цена позиции (мин. ед.)", "unit", 28), column("Сумма позиции (мин. ед.)", "total", 28), column("Стоимость приёмки (мин. ед.)", "receiptCost", 30)] : [])];
  totals.columns = [column("Статус", "status"), column("Валюта", "currency", 12), column("Документов", "documents", 16), column("Заказано", "ordered", 14), column("Получено", "received", 14), column("Ещё не получено", "remaining", 20), ...(report.costVisible ? [column("Сумма документов (мин. ед.)", "total", 30), column("Стоимость приёмки (мин. ед.)", "receiptCost", 30)] : [])];
  const byId = new Map(report.documents.map(row => [row.id, row]));
  const sums = new Map<string, { status: string; currency: string; documents: number; ordered: number; received: number; remaining: number; total: bigint; receiptCost: bigint }>();
  for (const document of report.documents) {
    documents.addRow({ number: safeText(document.number), created: document.createdAt.toISOString(), status: labels[document.status], supplier: safeText(document.supplier), branch: safeText(document.branch), currency: safeText(document.currency), ...(report.costVisible ? { total: exact(document.totalMinor) } : {}) });
    const key = document.status + ":" + document.currency;
    const sum = sums.get(key) ?? { status: labels[document.status], currency: document.currency, documents: 0, ordered: 0, received: 0, remaining: 0, total: BigInt(0), receiptCost: BigInt(0) };
    sum.documents++; if (report.costVisible) sum.total += document.totalMinor ?? BigInt(0); sums.set(key, sum);
  }
  for (const line of report.lines) {
    const document = byId.get(line.purchaseId)!;
    items.addRow({ number: safeText(document.number), status: labels[document.status], product: safeText(line.product), variant: safeText(line.variant), sku: safeText(line.sku), currency: safeText(line.currency), ordered: line.ordered, received: line.received, remaining: line.remaining,
      ...(report.costVisible ? { unit: exact(line.unitCostMinor), total: exact(line.lineTotalMinor), receiptCost: exact(line.receivedCostMinor) } : {}) });
    const sum = sums.get(document.status + ":" + line.currency)!;
    sum.ordered += line.ordered; sum.received += line.received; sum.remaining += line.remaining;
    if (report.costVisible) sum.receiptCost += line.receivedCostMinor ?? BigInt(0);
  }
  for (const sum of [...sums.values()].sort((a, b) => (a.status + a.currency).localeCompare(b.status + b.currency))) totals.addRow({ status: sum.status, currency: safeText(sum.currency), documents: sum.documents, ordered: sum.ordered, received: sum.received, remaining: sum.remaining,
    ...(report.costVisible ? { total: exact(sum.total), receiptCost: exact(sum.receiptCost) } : {}) });
  for (const sheet of [documents, items, totals]) {
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
