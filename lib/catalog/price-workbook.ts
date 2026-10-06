import ExcelJS from "exceljs";
import JSZip from "jszip";
import { SaxesParser } from "saxes";

export const PRICE_HEADERS = ["Код модели", "Название товара", "Категория", "Цвет", "Исполнение", "Размер (код)", "Размер (название)", "SKU", "Цена аренды, ₸", "Цена продажи, ₸", "Сдаётся", "Продаётся", "ID варианта", "ID модели"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

export type PriceWorkbookRow = {
  row: number;
  variantId: string;
  productId: string;
  sku: string;
  internalCode: string;
  rental: bigint | null;
  sale: bigint | null;
};

export type PriceWorkbookResult = { rows: PriceWorkbookRow[]; errors: string[] };

// The initial owner template uses namespace-prefixed OOXML. ExcelJS cannot load
// that producer's workbook directly; read its cell payload and then validate it
// through the same path as a workbook saved again by Excel.
async function loadSheet(bytes: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("Цены");
    if (!sheet) throw new Error("Не найден лист «Цены».");
    return sheet;
  } catch (original) {
    const zip = await JSZip.loadAsync(bytes);
    const bookXml = await zip.file("xl/workbook.xml")?.async("string");
    const sheetXml = await zip.file("xl/worksheets/sheet1.xml")?.async("string");
    if (!bookXml?.includes('name="Цены"') || !sheetXml?.includes("<x:worksheet")) throw original;
    const result = new ExcelJS.Workbook().addWorksheet("Цены");
    const parser = new SaxesParser({ xmlns: true });
    let address = "", kind = "", value = "", inValue = false, formula = false;
    parser.on("opentag", tag => {
      if (tag.local === "c") { address = String(tag.attributes.r?.value ?? ""); kind = String(tag.attributes.t?.value ?? ""); value = ""; formula = false; }
      if (address && tag.local === "f") formula = true;
      if (address && (tag.local === "v" || tag.local === "t")) inValue = true;
    });
    parser.on("text", text => { if (inValue) value += text; });
    parser.on("closetag", tag => {
      if (tag.local === "v" || tag.local === "t") inValue = false;
      if (tag.local === "c" && address) {
        result.getCell(address).value = formula ? { formula: "REJECTED" } : kind === "n" && value ? Number(value) : value;
        address = "";
      }
    });
    parser.write(sheetXml).close();
    return result;
  }
}

function plain(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object" && "richText" in value) return value.richText.map(item => item.text).join("").trim();
  throw new Error(`Формула или неподдерживаемое значение в ${cell.address}.`);
}

function amount(cell: ExcelJS.Cell): bigint | null {
  const value = plain(cell);
  if (!value) return null;
  if (!/^[1-9]\d{0,9}$/.test(value) || BigInt(value) > BigInt(10_000_000)) throw new Error(`Цена в ${cell.address} должна быть целым положительным числом до 10 000 000 ₸.`);
  return BigInt(value);
}

export async function parsePriceWorkbook(bytes: Buffer): Promise<PriceWorkbookResult> {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("Файл цен должен быть XLSX размером до 5 МБ.");
  const sheet = await loadSheet(bytes);
  if (sheet.rowCount - 7 > MAX_ROWS) throw new Error("Слишком много строк в файле цен.");
  for (let col = 1; col <= PRICE_HEADERS.length; col++) {
    if (plain(sheet.getCell(7, col)) !== PRICE_HEADERS[col - 1]) throw new Error(`Изменён заголовок ${col} на листе «Цены».`);
  }
  const rows: PriceWorkbookRow[] = [], errors: string[] = [], seen = new Set<string>();
  for (let row = 8; row <= sheet.rowCount; row++) {
    const cells = [1, 8, 9, 10, 13, 14].map(col => sheet.getCell(row, col));
    try {
      const [code, sku, rentalCell, saleCell, variantCell, productCell] = cells;
      const variantId = plain(variantCell), productId = plain(productCell);
      if (!variantId && !productId && !plain(sku) && !plain(rentalCell) && !plain(saleCell)) continue;
      if (!UUID.test(variantId) || !UUID.test(productId)) throw new Error("Отсутствует или изменён ID варианта/модели.");
      if (seen.has(variantId)) throw new Error("Повторяется ID варианта.");
      seen.add(variantId);
      const internalCode = plain(code), skuValue = plain(sku);
      if (!internalCode || !skuValue) throw new Error("Отсутствует код модели или SKU.");
      rows.push({ row, variantId, productId, internalCode, sku: skuValue, rental: amount(rentalCell), sale: amount(saleCell) });
    } catch (error) { errors.push(`Строка ${row}: ${(error as Error).message}`); }
  }
  if (!rows.length) errors.push("На листе «Цены» нет вариантов.");
  return { rows, errors };
}

export type PriceCatalogVariant = { id: string; sku: string; isActive: boolean; product: { id: string; internalCode: string; archivedAt: Date | null; isRentable: boolean; isSellable: boolean } };
export function previewPriceChanges(parsed: PriceWorkbookResult, variants: PriceCatalogVariant[]) {
  const errors = [...parsed.errors], byId = new Map(variants.map(variant => [variant.id, variant]));
  const submitted = new Set(parsed.rows.map(row => row.variantId));
  // A complete export is required: a missing row can hide an accidental deletion.
  for (const variant of variants) if (variant.isActive && !variant.product.archivedAt && !submitted.has(variant.id)) errors.push(`Отсутствует вариант ${variant.sku} (${variant.id}).`);
  const changes: Array<{ row: number; variantId: string; type: "RENTAL" | "SALE"; amountMinor: bigint }> = [];
  for (const row of parsed.rows) {
    const variant = byId.get(row.variantId);
    if (!variant || !variant.isActive || variant.product.archivedAt) { errors.push(`Строка ${row.row}: вариант отсутствует или архивирован.`); continue; }
    if (variant.product.id !== row.productId || variant.sku !== row.sku || variant.product.internalCode !== row.internalCode) { errors.push(`Строка ${row.row}: ID, SKU или код модели не совпадают с CRM.`); continue; }
    if (row.rental !== null && !variant.product.isRentable) errors.push(`Строка ${row.row}: товар не сдаётся в аренду.`);
    else if (row.rental !== null) changes.push({ row: row.row, variantId: row.variantId, type: "RENTAL", amountMinor: row.rental });
    if (row.sale !== null && !variant.product.isSellable) errors.push(`Строка ${row.row}: товар не продаётся.`);
    else if (row.sale !== null) changes.push({ row: row.row, variantId: row.variantId, type: "SALE", amountMinor: row.sale });
  }
  return { errors, changes, variants: parsed.rows.length, rentalPrices: changes.filter(change => change.type === "RENTAL").length, salePrices: changes.filter(change => change.type === "SALE").length };
}
