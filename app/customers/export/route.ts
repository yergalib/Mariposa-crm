import ExcelJS from "exceljs";
import { getCurrentSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { getCustomerExportRows } from "@/lib/customers/queries";
import { SOURCES } from "@/lib/customers/validation";
import { createTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";

function safeText(value: string | null | undefined) {
  const clean = (value ?? "").replace(/[\r\n\t]+/g, " ");
  return /^\s*[=+\-@]/.test(clean) ? `'${clean}` : clean;
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return new Response("Требуется вход.", { status: 401 });
  if (!await hasPermission(session, "CUSTOMER_EXPORT")) return new Response("Недостаточно прав.", { status: 403 });
  const params = new URL(request.url).searchParams;
  const statusParam = params.get("status");
  const status = statusParam === "" || statusParam === "ACTIVE" || statusParam === "BLOCKED" || statusParam === "ARCHIVED" ? statusParam : undefined;
  const sourceParam = params.get("source");
  const source = sourceParam && SOURCES.includes(sourceParam as typeof SOURCES[number]) ? sourceParam : undefined;
  let rows;
  try {
    rows = await getCustomerExportRows(createTenantContext(session.organizationId), {
      search: params.get("q") ?? undefined, status, source
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("5000 клиентов")) return new Response(error.message, { status: 413 });
    throw error;
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Клиенты");
  sheet.columns = [
    { header: "Номер", key: "number", width: 18 },
    { header: "Имя", key: "firstName", width: 24 },
    { header: "Фамилия", key: "lastName", width: 24 },
    { header: "Отчество", key: "middleName", width: 24 },
    { header: "Телефон", key: "phone", width: 24 },
    { header: "Email", key: "email", width: 32 },
    { header: "Источник", key: "source", width: 18 },
    { header: "Статус", key: "status", width: 18 },
    { header: "Создан", key: "createdAt", width: 18 }
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "I1" };
  for (const customer of rows) {
    const phone = customer.contacts.find(c => c.type === "PHONE");
    const email = customer.contacts.find(c => c.type === "EMAIL");
    sheet.addRow({
      number: safeText(customer.customerNumber), firstName: safeText(customer.firstName),
      lastName: safeText(customer.lastName), middleName: safeText(customer.middleName),
      phone: safeText(phone?.value), email: safeText(email?.value), source: customer.source ?? "",
      status: customer.status, createdAt: customer.createdAt
    });
  }
  sheet.getColumn("createdAt").numFmt = "dd.mm.yyyy";
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(buffer), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="mariposa-customers-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    "Cache-Control": "private, no-store"
  } });
}
