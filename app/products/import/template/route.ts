import { getCurrentSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { makeProductSheetTemplate } from "@/lib/catalog/product-sheet-parser";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return new Response("Требуется вход.", { status: 401 });
  if (!await hasPermission(session, "CATALOG_IMPORT")) return new Response("Недостаточно прав.", { status: 403 });
  const [categories, sizes] = await Promise.all([
    db.category.findMany({ where: { organizationId: session.organizationId, status: "ACTIVE" }, select: { name: true }, orderBy: { name: "asc" } }),
    db.size.findMany({ where: { organizationId: session.organizationId, isActive: true }, select: { sizeSystem: true, code: true, name: true }, orderBy: [{ sizeSystem: "asc" }, { sortOrder: "asc" }] })
  ]);
  const workbook = makeProductSheetTemplate(), reference = workbook.addWorksheet("Справочник CRM");
  reference.columns = [
    { header: "Категории", key: "category", width: 35 },
    { header: "Система размеров", key: "system", width: 25 },
    { header: "Код размера", key: "code", width: 20 },
    { header: "Название размера", key: "name", width: 25 }
  ];
  reference.getRow(1).font = { bold: true };
  for (let i = 0; i < Math.max(categories.length, sizes.length); i++) reference.addRow({
    category: categories[i]?.name ?? "", system: sizes[i]?.sizeSystem ?? "",
    code: sizes[i]?.code ?? "", name: sizes[i]?.name ?? ""
  });
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(bytes), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="mariposa-new-products-template.xlsx"',
    "Cache-Control": "private, no-store"
  } });
}
