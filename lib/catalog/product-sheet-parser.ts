import ExcelJS from "exceljs";
import { buildVariantSku, normalizeScannableCode } from "@/lib/catalog/scannable-code";

export const PRODUCT_SHEET_HEADERS = ["Код товара", "Название", "Категория", "Система размеров", "Код размера", "SKU", "Цвет", "Учёт", "Модель поставщика"] as const;
export type ProductSheetRow = { line: number; internalCode: string; name: string; category: string; sizeSystem: string; sizeCode: string; sku: string; color: string; trackingMode: "BULK" | "SERIALIZED"; supplierModel: string };
export type ProductSheetPlan = { rows: ProductSheetRow[]; errors: string[]; productCount: number };
const MAX_ROWS = 500;

export async function parseProductSheet(bytes: Buffer): Promise<ProductSheetPlan> {
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error("Файл должен быть XLSX размером до 2 МБ.");
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer); }
  catch { throw new Error("Не удалось прочитать XLSX. Проверьте формат файла."); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("В книге нет листа с товарами.");
  for (let col = 1; col <= PRODUCT_SHEET_HEADERS.length; col++) {
    if (sheet.getCell(1, col).value !== PRODUCT_SHEET_HEADERS[col - 1]) throw new Error(`Заголовок столбца ${col} не совпадает с шаблоном.`);
  }
  if (sheet.actualRowCount - 1 > MAX_ROWS || sheet.rowCount > MAX_ROWS + 1) throw new Error(`Максимум ${MAX_ROWS} строк товаров.`);
  const rows: ProductSheetRow[] = [], errors: string[] = [];
  const codes = new Map<string, ProductSheetRow>(), skus = new Set<string>(), sizes = new Set<string>();
  for (let line = 2; line <= sheet.rowCount; line++) {
    const cells = Array.from({ length: PRODUCT_SHEET_HEADERS.length }, (_, i) => sheet.getCell(line, i + 1));
    if (cells.every(cell => cell.value === null)) continue;
    if (cells.some(cell => cell.value && typeof cell.value === "object" && ("formula" in cell.value || "sharedFormula" in cell.value))) {
      errors.push(`Строка ${line}: формулы не допускаются.`); continue;
    }
    const values = cells.map(cell => {
      const value = cell.value;
      return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    });
    if (cells.some(cell => cell.value !== null && cell.value !== undefined && typeof cell.value !== "string" && typeof cell.value !== "number")) { errors.push(`Строка ${line}: допустимы только текст и числа.`); continue; }
    const [code, name, category, system, size, suppliedSku, color, mode, supplierModel] = values;
    const internalCode = normalizeScannableCode(code), sizeCode = normalizeScannableCode(size);
    const sizeSystem = system || "LEGACY";
    const sku = suppliedSku ? normalizeScannableCode(suppliedSku) : code && size ? buildVariantSku(code, size) : "";
    const trackingMode = mode.toUpperCase() || "BULK";
    if (!internalCode || internalCode.length > 80 || !name || name.length > 160 || !sizeCode || sizeCode.length > 40 || sizeSystem.length > 80 || sku.length > 100 || !sku || category.length > 120 || color.length > 120 || supplierModel.length > 120 || (trackingMode !== "BULK" && trackingMode !== "SERIALIZED")) {
      errors.push(`Строка ${line}: проверьте обязательные поля, длину текста и значение «Учёт» (BULK или SERIALIZED).`); continue;
    }
    const row: ProductSheetRow = { line, internalCode, name, category, sizeSystem, sizeCode, sku, color, trackingMode: trackingMode as ProductSheetRow["trackingMode"], supplierModel };
    const old = codes.get(internalCode);
    if (old && (old.name !== name || old.category !== category || old.color !== color || old.trackingMode !== row.trackingMode || old.supplierModel !== supplierModel)) errors.push(`Строка ${line}: сведения о товаре ${internalCode} отличаются от строки ${old.line}.`);
    if (skus.has(sku)) errors.push(`Строка ${line}: SKU ${sku} повторяется в файле.`);
    const sizeKey = `${internalCode}\0${sizeSystem}\0${sizeCode}`;
    if (sizes.has(sizeKey)) errors.push(`Строка ${line}: размер товара повторяется.`);
    codes.set(internalCode, old ?? row); skus.add(sku); sizes.add(sizeKey); rows.push(row);
  }
  if (!rows.length) errors.push("В файле нет товаров.");
  return { rows, errors, productCount: codes.size };
}

export function makeProductSheetTemplate() {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Новые товары");
  sheet.addRow([...PRODUCT_SHEET_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns.forEach(column => { column.width = 22; });
  sheet.getColumn(2).width = 40;
  sheet.getColumn(1).numFmt = "@"; sheet.getColumn(5).numFmt = "@"; sheet.getColumn(6).numFmt = "@";
  return workbook;
}
