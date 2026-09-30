import { getCurrentSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { makeProductSheetTemplate } from "@/lib/catalog/product-sheet-parser";

export const runtime = "nodejs";
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return new Response("Требуется вход.", { status: 401 });
  if (!await hasPermission(session, "CATALOG_IMPORT")) return new Response("Недостаточно прав.", { status: 403 });
  const bytes = await makeProductSheetTemplate().xlsx.writeBuffer();
  return new Response(Buffer.from(bytes), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="mariposa-new-products-template.xlsx"',
    "Cache-Control": "private, no-store"
  } });
}
