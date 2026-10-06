// Read-only review of a completed MARIPOSA price workbook. No price is written here.
// Usage: npx tsx scripts/preview-price-workbook.ts FILE.xlsx ORGANIZATION_UUID
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { db } from "../lib/db";
import { parsePriceWorkbook, previewPriceChanges } from "../lib/catalog/price-workbook";

async function main() {
  const [, , file, organizationId] = process.argv;
  if (!file || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(organizationId ?? "")) throw new Error("Укажите XLSX и ID организации.");
  const parsed = await parsePriceWorkbook(await readFile(file));
  const variants = await db.productVariant.findMany({
    where: { organizationId, product: { archivedAt: null } },
    select: { id: true, sku: true, isActive: true, product: { select: { id: true, internalCode: true, archivedAt: true, isRentable: true, isSellable: true } } },
  });
  const preview = previewPriceChanges(parsed, variants);
  const ids = preview.changes.map(change => change.variantId);
  const now = new Date();
  const existing = ids.length ? await db.productPrice.findMany({
    where: { organizationId, productVariantId: { in: ids }, branchId: null, currency: "KZT", validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
    select: { productVariantId: true, type: true, amountMinor: true },
  }) : [];
  const current = new Map(existing.map(price => [`${price.productVariantId}:${price.type}`, price.amountMinor]));
  const changed = preview.changes.filter(change => current.get(`${change.variantId}:${change.type}`) !== change.amountMinor);
  const conflicts = existing.length - current.size;
  if (conflicts) preview.errors.push(`В CRM найдены ${conflicts} пересекающихся действующих цен.`);
  console.log(JSON.stringify({ status: preview.errors.length ? "INVALID" : "READY_FOR_REVIEW", rows: preview.variants, rentalFilled: preview.rentalPrices, saleFilled: preview.salePrices, pricesToChange: changed.length, alreadyEqual: preview.changes.length - changed.length, errors: preview.errors }, null, 2));
  if (preview.errors.length) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
