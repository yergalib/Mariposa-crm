import {workspaceOrderWhere} from "@/lib/orders/workspace";
import ExcelJS from "exceljs";
import { ORDER_LIST_FILTER_KEYS, OrderListFilterError, readOrderListFilters } from "@/lib/orders/list-filters";
import { getCurrentSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { db } from "@/lib/db";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";

export const runtime = "nodejs";
const MAX_ORDERS = 5000;

function safeText(value: string | null | undefined) {
  const clean = (value ?? "").replace(/[\r\n\t]+/g, " ");
  return /^\s*[=+\-@]/.test(clean) ? `'${clean}` : clean;
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return new Response("Требуется вход.", { status: 401 });
  if (!await hasPermission(session, "ORDER_VIEW") || !await hasPermission(session, "ORDER_EXPORT")) return new Response("Недостаточно прав.", { status: 403 });
  const params = new URL(request.url).searchParams;
  let filters;
  try {
    filters = readOrderListFilters(Object.fromEntries(ORDER_LIST_FILTER_KEYS.map(key => {
      const values = params.getAll(key);
      return [key, values.length > 1 ? values : values[0]];
    })));
  } catch (error) {
    if (error instanceof OrderListFilterError) return new Response(error.message, { status: 400 });
    throw error;
  }
  const { branchId } = filters;
  if (branchId && !session.hasOrganizationWideBranchAccess && !session.allowedBranchIds.includes(branchId)) return new Response("Филиал недоступен.", { status: 403 });
  let where;
  try { where = await workspaceOrderWhere(session,filters); } catch (error) { return new Response(error instanceof Error ? error.message : "Недостаточно прав.", {status:403}); }
  const rows = await db.order.findMany({
    where,
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
