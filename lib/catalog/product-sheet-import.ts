import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseProductSheet, type ProductSheetRow } from "@/lib/catalog/product-sheet-parser";

export class ProductSheetError extends Error {}

const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("ru");
type CatalogSnapshot = {
  categories: Array<{ id: string; name: string }>;
  sizes: Array<{ id: string; sizeSystem: string; code: string }>;
  products: Array<{ internalCode: string }>;
  variants: Array<{ sku: string }>;
  barcodes: Array<{ barcode: string }>;
};

async function snapshot(organizationId: string, rows: ProductSheetRow[], client: typeof db | Prisma.TransactionClient = db): Promise<CatalogSnapshot> {
  const codes = [...new Set(rows.map(row => row.internalCode))], skus = [...new Set(rows.map(row => row.sku))];
  const [categories, sizes, products, variants, barcodes] = await Promise.all([
    client.category.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true } }),
    client.size.findMany({ where: { organizationId, isActive: true }, select: { id: true, sizeSystem: true, code: true } }),
    client.product.findMany({ where: { organizationId, OR: codes.map(code => ({ internalCode: { equals: code, mode: "insensitive" as const } })) }, select: { internalCode: true } }),
    client.productVariant.findMany({ where: { organizationId, OR: skus.map(sku => ({ sku: { equals: sku, mode: "insensitive" as const } })) }, select: { sku: true } }),
    client.productInstance.findMany({ where: { organizationId, OR: skus.map(barcode => ({ barcode: { equals: barcode, mode: "insensitive" as const } })) }, select: { barcode: true } })
  ]);
  return { categories, sizes, products, variants, barcodes };
}

export function validateProductSheet(rows: ProductSheetRow[], current: CatalogSnapshot) {
  const errors: string[] = [];
  const categoryMap = new Map<string, string[]>(), sizeMap = new Map<string, string>();
  for (const category of current.categories) {
    const key = normalize(category.name), ids = categoryMap.get(key) ?? [];
    ids.push(category.id); categoryMap.set(key, ids);
  }
  for (const size of current.sizes) sizeMap.set(`${normalize(size.sizeSystem)}\0${normalize(size.code)}`, size.id);
  const codes = new Set(current.products.map(row => normalize(row.internalCode)));
  const skus = new Set([...current.variants.map(row => normalize(row.sku)), ...current.barcodes.map(row => normalize(row.barcode))]);
  for (const row of rows) {
    if (row.category && categoryMap.get(normalize(row.category))?.length !== 1) errors.push(`Строка ${row.line}: категория «${row.category}» отсутствует или неоднозначна.`);
    if (!sizeMap.has(`${normalize(row.sizeSystem)}\0${normalize(row.sizeCode)}`)) errors.push(`Строка ${row.line}: размер ${row.sizeSystem}/${row.sizeCode} не найден в настройках.`);
    if (codes.has(normalize(row.internalCode))) errors.push(`Строка ${row.line}: код ${row.internalCode} уже есть в CRM.`);
    if (skus.has(normalize(row.sku))) errors.push(`Строка ${row.line}: SKU ${row.sku} уже есть в CRM.`);
  }
  return { errors, categoryMap, sizeMap };
}

export async function previewProductSheet(organizationId: string, userId: string, file: File) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new ProductSheetError("Выберите файл XLSX.");
  if (file.type && file.type !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") throw new ProductSheetError("Некорректный формат XLSX.");
  let parsed;
  try { parsed = await parseProductSheet(Buffer.from(await file.arrayBuffer())); }
  catch (error) { throw new ProductSheetError(error instanceof Error ? error.message : "Не удалось прочитать файл."); }
  const current = parsed.rows.length ? await snapshot(organizationId, parsed.rows) : null;
  const errors = [...parsed.errors, ...(current ? validateProductSheet(parsed.rows, current).errors : [])];
  return db.productSheetImport.create({ data: {
    organizationId, createdByUserId: userId, filename: file.name.slice(0, 200),
    rows: parsed.rows as unknown as Prisma.InputJsonValue, errors,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000)
  } });
}

export async function getProductSheetPreview(organizationId: string, userId: string, id: string) {
  return db.productSheetImport.findFirst({ where: { id, organizationId, createdByUserId: userId, expiresAt: { gt: new Date() } } });
}

export async function applyProductSheet(organizationId: string, userId: string, id: string) {
  return db.$transaction(async tx => {
    // Lock the preview row: concurrent confirmations cannot both create the same products.
    const locks = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM product_sheet_imports WHERE id=${id}::uuid AND organization_id=${organizationId}::uuid AND created_by_user_id=${userId}::uuid AND expires_at>now() FOR UPDATE`);
    if (!locks.length) throw new ProductSheetError("Предпросмотр не найден или истёк.");
    const batch = await tx.productSheetImport.findUniqueOrThrow({ where: { id } });
    if (batch.status !== "PREVIEW") throw new ProductSheetError("Этот файл уже импортирован.");
    const rows = batch.rows as unknown as ProductSheetRow[], errors = batch.errors as string[];
    if (!Array.isArray(rows) || !rows.length || rows.length > 500 || !Array.isArray(errors) || errors.length) throw new ProductSheetError("Исправьте ошибки в файле и загрузите его снова.");
    const current = await snapshot(organizationId, rows, tx);
    const checked = validateProductSheet(rows, current);
    if (checked.errors.length) throw new ProductSheetError(`Каталог изменился после предпросмотра: ${checked.errors[0]}`);
    const ids = new Map<string, string>();
    for (const row of rows) {
      let productId = ids.get(row.internalCode);
      if (!productId) {
        const categoryId = row.category ? checked.categoryMap.get(normalize(row.category))![0] : null;
        const created = await tx.product.create({ data: {
          organizationId, internalCode: row.internalCode, name: row.name,
          categoryId, color: row.color || null, supplierModel: row.supplierModel || null,
          trackingMode: row.trackingMode, isRentable: true, isSellable: true,
          publicationStatus: "DRAFT"
        } });
        productId = created.id; ids.set(row.internalCode, productId);
      }
      const sizeId = checked.sizeMap.get(`${normalize(row.sizeSystem)}\0${normalize(row.sizeCode)}`)!;
      await tx.productVariant.create({ data: { organizationId, productId, sizeId, sku: row.sku } });
    }
    await tx.productSheetImport.update({ where: { id }, data: { status: "APPLIED", completedAt: new Date() } });
    return { products: ids.size, variants: rows.length };
  }, { maxWait: 10000, timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
