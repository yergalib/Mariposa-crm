import ExcelJS from "exceljs";
import { getCurrentSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function text(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/[\r\n\t]+/g, " ");
  return /^[\s]*[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return new Response("Требуется вход.", { status: 401 });
  if (!await hasPermission(session, "CATALOG_VIEW")) return new Response("Недостаточно прав.", { status: 403 });

  const params = new URL(request.url).searchParams;
  const search = params.get("q")?.trim().slice(0, 100);
  const categoryId = params.get("category") || undefined;
  const includeArchived = params.get("archived") === "1";
  const organizationId = session.organizationId;
  const now = new Date();
  const products = await db.product.findMany({
    where: {
      organizationId,
      ...(includeArchived ? {} : { publicationStatus: "ACTIVE" as const, archivedAt: null }),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { internalCode: { contains: search, mode: "insensitive" as const } },
        { variants: { some: { organizationId, sku: { contains: search, mode: "insensitive" as const } } } }
      ] } : {})
    },
    select: {
      name: true, internalCode: true, supplierModel: true, color: true,
      publicationStatus: true, category: { select: { name: true } },
      variants: {
        where: { organizationId, isActive: true, size: { organizationId } },
        select: {
          sku: true, size: { select: { code: true, name: true } },
          execution: { select: { name: true } },
          prices: {
            where: {
              organizationId, validFrom: { lte: now },
              AND: [
                { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
                session.defaultBranchId
                  ? { OR: [{ branchId: session.defaultBranchId }, { branchId: null }] }
                  : { branchId: null }
              ]
            },
            select: { type: true, amountMinor: true, currency: true, branchId: true },
            orderBy: { validFrom: "desc" }
          }
        },
        orderBy: { sku: "asc" }
      }
    },
    orderBy: [{ name: "asc" }, { internalCode: "asc" }],
    take: 10001
  });
  if (products.length > 10000) return new Response("Слишком много товаров для одной выгрузки. Уточните фильтр.", { status: 413 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Товары");
  sheet.columns = [
    { header: "Код товара", key: "code", width: 20 },
    { header: "Название", key: "name", width: 40 },
    { header: "Категория", key: "category", width: 25 },
    { header: "Модель поставщика", key: "model", width: 24 },
    { header: "Цвет", key: "color", width: 20 },
    { header: "Исполнение", key: "execution", width: 22 },
    { header: "Размер", key: "size", width: 18 },
    { header: "Код размера", key: "sizeCode", width: 18 },
    { header: "SKU", key: "sku", width: 25 },
    { header: "Аренда", key: "rental", width: 17 },
    { header: "Продажа", key: "sale", width: 17 },
    { header: "Валюта аренды", key: "rentalCurrency", width: 18 },
    { header: "Валюта продажи", key: "saleCurrency", width: 18 },
    { header: "Статус", key: "status", width: 16 }
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "N1" };
  for (const product of products) for (const variant of product.variants) {
    const price = (type: "RENTAL" | "SALE") => variant.prices.find(p => p.type === type && p.branchId === session.defaultBranchId)
      ?? variant.prices.find(p => p.type === type && p.branchId === null);
    const rental = price("RENTAL"), sale = price("SALE");
    sheet.addRow({
      code: text(product.internalCode), name: text(product.name), category: text(product.category?.name),
      model: text(product.supplierModel), color: text(product.color), execution: text(variant.execution?.name),
      size: text(variant.size.name), sizeCode: text(variant.size.code), sku: text(variant.sku),
      rental: rental ? Number(rental.amountMinor) : null,
      sale: sale ? Number(sale.amountMinor) : null,
      rentalCurrency: rental?.currency ?? "", saleCurrency: sale?.currency ?? "",
      status: product.publicationStatus
    });
  }
  sheet.getColumn("rental").numFmt = "#,##0";
  sheet.getColumn("sale").numFmt = "#,##0";
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mariposa-products-${now.toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "private, no-store"
    }
  });
}
