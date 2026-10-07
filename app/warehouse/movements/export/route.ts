import { MOVEMENT_LABELS } from "@/lib/inventory/movement-labels";
import ExcelJS from "exceljs";
import { InventoryMovementType } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions/effective";

export const runtime = "nodejs";
const LIMIT = 10000;
function safeText(value: string | null | undefined) {
  const clean = (value ?? "").replace(/[\r\n\t]+/g, " ");
  return /^\s*[=+\-@]/.test(clean) ? `'${clean}` : clean;
}
export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return new Response("Требуется вход.", { status: 401 });
  if (!await hasPermission(session, "INVENTORY_VIEW") || !await hasPermission(session, "INVENTORY_EXPORT")) return new Response("Недостаточно прав.", { status: 403 });
  const params = new URL(request.url).searchParams;
  const typeParam = params.get("type");
  if (typeParam && !Object.values(InventoryMovementType).includes(typeParam as InventoryMovementType)) return new Response("Некорректный тип.", { status: 400 });
  const query = params.get("q")?.trim().slice(0, 100);
  const allowed = session.hasOrganizationWideBranchAccess ? null : session.allowedBranchIds;
  const branch = params.get("branch");
  if (branch && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branch)) return new Response("Некорректный филиал.", { status: 400 });
  if (branch && allowed && !allowed.includes(branch)) return new Response("Филиал недоступен.", { status: 403 });
  const rows = await db.inventoryMovement.findMany({
    where: {
      organizationId: session.organizationId,
      type: typeParam as InventoryMovementType || undefined,
      AND: [
        ...(branch ? [{ OR: [{ fromBranchId: branch }, { toBranchId: branch }] }] : []),
        ...(allowed ? [{ OR: [{ fromBranchId: { in: allowed } }, { toBranchId: { in: allowed } }] }] : []),
        ...(query ? [{ OR: [
          { productVariant: { sku: { contains: query, mode: "insensitive" as const } } },
          { productVariant: { product: { name: { contains: query, mode: "insensitive" as const } } } },
          { productInstance: { barcode: { contains: query, mode: "insensitive" as const } } },
          { productInstance: { inventoryNumber: { contains: query, mode: "insensitive" as const } } }
        ] }] : [])
      ]
    },
    select: {
      occurredAt: true, type: true, quantity: true, reason: true,
      productVariant: { select: { sku: true, product: { select: { name: true, internalCode: true } }, size: { select: { code: true } } } },
      productInstance: { select: { inventoryNumber: true, barcode: true } },
      fromBranch: { select: { name: true } }, fromLocation: { select: { name: true } },
      toBranch: { select: { name: true } }, toLocation: { select: { name: true } },
      createdBy: { select: { displayName: true } }
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: LIMIT + 1
  });
  if (rows.length > LIMIT) return new Response("Выгрузка превышает 10000 операций. Уточните фильтр.", { status: 413 });
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Движения склада");
  sheet.columns = [
    { header: "Дата", key: "date", width: 23 }, { header: "Тип", key: "type", width: 23 },
    { header: "Код товара", key: "code", width: 23 }, { header: "Товар", key: "name", width: 42 },
    { header: "Размер", key: "size", width: 18 }, { header: "SKU", key: "sku", width: 29 },
    { header: "Инвентарный номер", key: "number", width: 27 }, { header: "Штрихкод", key: "barcode", width: 26 },
    { header: "Количество", key: "quantity", width: 17 },
    { header: "Из филиала", key: "fromBranch", width: 27 }, { header: "Из места", key: "fromLocation", width: 27 },
    { header: "В филиал", key: "toBranch", width: 27 }, { header: "В место", key: "toLocation", width: 27 },
    { header: "Сотрудник", key: "actor", width: 30 }, { header: "Причина", key: "reason", width: 45 }
  ];
  for (const row of rows) sheet.addRow({
    date: row.occurredAt, type: MOVEMENT_LABELS[row.type] ?? row.type, code: safeText(row.productVariant.product.internalCode),
    name: safeText(row.productVariant.product.name), size: safeText(row.productVariant.size.code), sku: safeText(row.productVariant.sku),
    number: safeText(row.productInstance?.inventoryNumber), barcode: safeText(row.productInstance?.barcode), quantity: row.quantity,
    fromBranch: safeText(row.fromBranch?.name), fromLocation: safeText(row.fromLocation?.name),
    toBranch: safeText(row.toBranch?.name), toLocation: safeText(row.toLocation?.name),
    actor: safeText(row.createdBy?.displayName ?? "Система"), reason: safeText(row.reason)
  });
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "O1" };
  sheet.getColumn("date").numFmt = "dd.mm.yyyy hh:mm";
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(bytes), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="mariposa-movements-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    "Cache-Control": "private, no-store"
  } });
}
