import assert from "node:assert/strict";
import { makeProductSheetTemplate, parseProductSheet, PRODUCT_SHEET_HEADERS } from "../lib/catalog/product-sheet-parser";

async function parse(lines: unknown[][]) {
  const book = makeProductSheetTemplate(), sheet = book.worksheets[0];
  for (const line of lines) sheet.addRow(line);
  return parseProductSheet(Buffer.from(await book.xlsx.writeBuffer()));
}
async function main() {
const normal = ["NEW-001", "Платье", "Платья", "LEGACY", "110", "", "золото", "BULK", "Модель 1"];
const second = ["NEW-001", "Платье", "Платья", "LEGACY", "120", "", "золото", "BULK", "Модель 1"];
const valid = await parse([normal, second]);
assert.deepEqual(valid.errors, []);
assert.equal(valid.productCount, 1);
assert.deepEqual(valid.rows.map(row => row.sku), ["NEW-001.110", "NEW-001.120"]);
const repeated = await parse([normal, normal]);
assert(repeated.errors.some(message => message.includes("повторяется")));
const inconsistent = await parse([normal, ["NEW-001", "Иное платье", ...normal.slice(2, 5), "", ...normal.slice(6)]]);
assert(inconsistent.errors.some(message => message.includes("отличаются")));
const formulaBook = makeProductSheetTemplate();
formulaBook.worksheets[0].addRow(normal);
formulaBook.worksheets[0].getCell("B2").value = { formula: 'HYPERLINK("https://example.com")' };
const formula = await parseProductSheet(Buffer.from(await formulaBook.xlsx.writeBuffer()));
assert(formula.errors.some(message => message.includes("формулы")));
assert.equal(PRODUCT_SHEET_HEADERS.length, 9);
console.log("PASS product sheet parser (grouping, SKU, duplicates, formula rejection)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
