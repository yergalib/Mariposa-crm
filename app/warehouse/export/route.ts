import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { parseInventoryStatus } from "@/lib/inventory/queries";

export const runtime = "nodejs";
const LIMIT = 10000;
function safeText(value: string | null | undefined) {
  const clean = (value ?? "").replace(/[\r\n\t]+/g, " ");
  return /^\s*[=+\-@]/.test(clean) ? `'${clean}` : clean;
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return new Response("Требуется вход.", { status: 401 });
  if (!await hasPermission(session, "INVENTORY_EXPORT")) return new Response("Недостаточно прав.", { status: 403 });
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim().slice(0, 100);
  const statusParam = params.get("status"), status = parseInventoryStatus(statusParam ?? undefined);
  if (statusParam && !status) return new Response("Некорректный статус.", { status: 400 });
  const branchFilter = session.hasOrganizationWideBranchAccess ? undefined : { in: session.allowedBranchIds };
  const organizationId = session.organizationId;
  const [bulk, instances] = await Promise.all([
    db.stockLevel.findMany({
      where: { organizationId, branchId: branchFilter, productVariant: { organizationId, product: { organizationId } } },
      select: {
        quantity: true, branch: { select: { name: true } }, location: { select: { name: true } },
        productVariant: { select: { sku: true, product: { select: { name: true, internalCode: true } }, size: { select: { code: true } } } }
      },
      orderBy: [{ branchId: "asc" }, { productVariantId: "asc" }, { locationId: "asc" }], take: LIMIT + 1
    }),
    db.productInstance.findMany({
      where: {
        organizationId, currentBranchId: branchFilter, operationalStatus: status,
        productVariant: { organizationId, product: { organizationId } },
        ...(query ? { OR: [
          { inventoryNumber: { contains: query, mode: "insensitive" as const } },
          { barcode: { contains: query, mode: "insensitive" as const } },
          { productVariant: { sku: { contains: query, mode: "insensitive" as const } } },
          { productVariant: { product: { name: { contains: query, mode: "insensitive" as const } } } }
        ] } : {})
      },
      select: {
        inventoryNumber: true, barcode: true, operationalStatus: true, conditionStatus: true,
        currentBranch: { select: { name: true } }, currentLocation: { select: { name: true } },
        productVariant: { select: { sku: true, product: { select: { name: true, internalCode: true } }, size: { select: { code: true } } } }
      },
      orderBy: [{ inventoryNumber: "asc" }, { id: "asc" }], take: LIMIT + 1
    })
  ]);
  if (bulk.length > LIMIT || instances.length > LIMIT) return new Response("Выгрузка превышает 10000 строк на лист. Уточните выборку.", { status: 413 });
  const workbook = new ExcelJS.Workbook();
  const bulkSheet = workbook.addWorksheet("BULK остатки");
  bulkSheet.columns = [
    { header: "Код товара", key: "code", width: 22 }, { header: "Товар", key: "name", width: 42 },
    { header: "Размер", key: "size", width: 18 }, { header: "SKU", key: "sku", width: 28 },
    { header: "Филиал", key: "branch", width: 27 }, { header: "Место", key: "location", width: 28 },
    { header: "Физический остаток", key: "quantity", width: 23 }
  ];
  for (const level of bulk) bulkSheet.addRow({
    code: safeText(level.productVariant.product.internalCode), name: safeText(level.productVariant.product.name),
    size: safeText(level.productVariant.size.code), sku: safeText(level.productVariant.sku),
    branch: safeText(level.branch.name), location: safeText(level.location?.name), quantity: level.quantity
  });
  const serialSheet = workbook.addWorksheet("Экземпляры");
  serialSheet.columns = [
    { header: "Инвентарный номер", key: "number", width: 25 }, { header: "Штрихкод", key: "barcode", width: 26 },
    { header: "Код товара", key: "code", width: 22 }, { header: "Товар", key: "name", width: 42 },
    { header: "Размер", key: "size", width: 18 }, { header: "SKU", key: "sku", width: 28 },
    { header: "Филиал", key: "branch", width: 27 }, { header: "Место", key: "location", width: 28 },
    { header: "Статус", key: "status", width: 23 }, { header: "Состояние", key: "condition", width: 23 }
  ];
  for (const item of instances) serialSheet.addRow({
    number: safeText(item.inventoryNumber), barcode: safeText(item.barcode),
    code: safeText(item.productVariant.product.internalCode), name: safeText(item.productVariant.product.name),
    size: safeText(item.productVariant.size.code), sku: safeText(item.productVariant.sku),
    branch: safeText(item.currentBranch.name), location: safeText(item.currentLocation.name),
    status: item.operationalStatus, condition: item.conditionStatus
  });
  for (const sheet of [bulkSheet, serialSheet]) {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: `${sheet === bulkSheet ? "G" : "J"}1` };
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(bytes), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="mariposa-stock-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    "Cache-Control": "private, no-store"
  } });
}
