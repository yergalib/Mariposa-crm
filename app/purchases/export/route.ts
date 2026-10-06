import { getCurrentSession } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { PermissionError } from "@/lib/permissions/effective";
import { StaffError } from "@/lib/staff/errors";
import { getPurchaseReport, readPurchaseReportFilters, PurchaseReportError } from "@/lib/purchases/report";
import { purchaseReportWorkbook } from "@/lib/purchases/report-workbook";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return new Response("Требуется вход.", { status: 401, headers: { "Cache-Control": "private, no-store" } });
  try {
    const filters = readPurchaseReportFilters(new URL(request.url).searchParams);
    const report = await getPurchaseReport(createTenantContext(session.organizationId), session, filters);
    const bytes = await purchaseReportWorkbook(report);
    return new Response(bytes, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mariposa-purchases-${report.generatedAt.toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    if (error instanceof PermissionError || error instanceof StaffError) return new Response("Недостаточно прав или филиал недоступен.", { status: 403, headers: { "Cache-Control": "private, no-store" } });
    if (error instanceof PurchaseReportError) return new Response(error.message, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    throw error;
  }
}
