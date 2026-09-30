import ExcelJS from "exceljs";
import { OrderChannel, OrderStatus, OrderType } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { db } from "@/lib/db";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";

export const runtime = "nodejs";
const MAX_ORDERS = 5000;

function oneOf<T extends string>(value: string | null, options: Record<string, T>): T | undefined {
  return value && Object.values(options).includes(value as T) ? value as T : undefined;
}
function safeText(value: string | null | undefined) {
  const clean = (value ?? "").replace(/[\r\n\t]+/g, " ");
  return /^\s*[=+\-@]/.test(clean) ? `'${clean}` : clean;
}
function dateParam(value: string | null) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return new Response("Требуется вход.", { status: 401 });
  if (!await hasPermission(session, "ORDER_EXPORT")) return new Response("Недостаточно прав.", { status: 403 });
  const params = new URL(request.url).searchParams;
  const statusParam = params.get("status"), typeParam = params.get("type"), sourceParam = params.get("source");
  const status = oneOf(statusParam, OrderStatus), type = oneOf(typeParam, OrderType), channel = oneOf(sourceParam, OrderChannel);
  const from = dateParam(params.get("from")), until = dateParam(params.get("until"));
  if ((statusParam && !status) || (typeParam && !type) || (sourceParam && !channel) || from === null || until === null) return new Response("Некорректный фильтр.", { status: 400 });
  const branchId = params.get("branchId") || undefined;
  if (branchId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(branchId)) return new Response("Некорректный филиал.", { status: 400 });
  if (branchId && !session.hasOrganizationWideBranchAccess && !session.allowedBranchIds.includes(branchId)) return new Response("Филиал недоступен.", { status: 403 });
  const search = params.get("q")?.trim().slice(0, 100);
  const rows = await db.order.findMany({
    where: {
      organizationId: session.organizationId,
      branchId: branchId ?? (session.hasOrganizationWideBranchAccess ? undefined : { in: session.allowedBranchIds }),
      status, type, channel,
      rentalStartAt: until ? { lt: until } : undefined,
      rentalEndAt: from ? { gt: from } : undefined,
      ...(search ? { OR: [
        { orderNumber: { contains: search, mode: "insensitive" as const } },
        { customer: { OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { contacts: { some: { value: { contains: search, mode: "insensitive" as const } } } }
        ] } }
      ] } : {})
    },
    select: {
      orderNumber: true, type: true, status: true, channel: true,
      rentalStartAt: true, rentalEndAt: true, totalMinor: true, currency: true, createdAt: true,
      branch: { select: { name: true, timezone: true } },
      customer: { select: { customerNumber: true, firstName: true, lastName: true, contacts: { where: { type: "PHONE" }, select: { value: true }, orderBy: { isPrimary: "desc" }, take: 1 } } },
      _count: { select: { items: { where: { removedAt: null } } } }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_ORDERS + 1
  });
  if (rows.length > MAX_ORDERS) return new Response("Для выгрузки более 5000 заказов уточните фильтр.", { status: 413 });
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Заказы");
  sheet.columns = [
    { header: "Номер заказа", key: "number", width: 20 },
    { header: "Тип", key: "type", width: 18 },
    { header: "Статус", key: "status", width: 23 },
    { header: "Канал", key: "channel", width: 20 },
    { header: "Клиент №", key: "customerNumber", width: 20 },
    { header: "Клиент", key: "customer", width: 35 },
    { header: "Телефон", key: "phone", width: 24 },
    { header: "Филиал", key: "branch", width: 25 },
    { header: "Начало аренды", key: "start", width: 23 },
    { header: "Конец аренды", key: "end", width: 23 },
    { header: "Позиций", key: "items", width: 14 },
    { header: "Сумма", key: "total", width: 18 },
    { header: "Валюта", key: "currency", width: 12 },
    { header: "Создан", key: "created", width: 18 }
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "N1" };
  for (const order of rows) sheet.addRow({
    number: safeText(order.orderNumber), type: order.type, status: order.status, channel: order.channel,
    customerNumber: safeText(order.customer.customerNumber),
    customer: safeText([order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ")),
    phone: safeText(order.customer.contacts[0]?.value), branch: safeText(order.branch.name),
    start: order.rentalStartAt ? formatBusinessDateTime(order.rentalStartAt, order.branch.timezone) : "",
    end: order.rentalEndAt ? formatBusinessDateTime(order.rentalEndAt, order.branch.timezone) : "",
    items: order._count.items, total: Number(order.totalMinor), currency: order.currency, created: order.createdAt
  });
  sheet.getColumn("total").numFmt = "#,##0";
  sheet.getColumn("created").numFmt = "dd.mm.yyyy";
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(bytes), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="mariposa-orders-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    "Cache-Control": "private, no-store"
  } });
}
