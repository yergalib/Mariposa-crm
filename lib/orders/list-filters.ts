import { OrderChannel, OrderStatus, OrderType } from "@/generated/prisma/client";

export const ORDER_LIST_FILTER_KEYS = ["q", "status", "type", "branchId", "source", "from", "until", "assignedMembershipId", "customerId", "payment", "overdue", "dateField"] as const;
export const RENTAL_PERIOD_FILTER_HELP = "Даты фильтруют пересечение периода аренды с интервалом в UTC: начало включается, конец не включается. Это не дата продажи. Для списка продаж очистите даты.";
export class OrderListFilterError extends Error {}

type RawFilters = Record<string, string | string[] | undefined>;
function dateParam(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new OrderListFilterError("Укажите существующую дату в формате ГГГГ-ММ-ДД.");
  }
  return date;
}
function oneOf<T extends string>(value: string | undefined, options: Record<string, T>): T | undefined {
  if (!value) return undefined;
  if (!Object.values(options).includes(value as T)) throw new OrderListFilterError("Некорректный тип, статус или канал заказа.");
  return value as T;
}
export function readOrderListFilters(raw: RawFilters) {
  const values: Record<string, string | undefined> = {};
  for (const key of ORDER_LIST_FILTER_KEYS) {
    if (Array.isArray(raw[key])) throw new OrderListFilterError("Каждый фильтр можно указать только один раз.");
    values[key] = raw[key] as string | undefined;
  }
  const status = oneOf(values.status, OrderStatus), type = oneOf(values.type, OrderType), source = oneOf(values.source, OrderChannel);
  const branchId = values.branchId || undefined;
  if (branchId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(branchId)) throw new OrderListFilterError("Некорректный филиал.");
  const from = dateParam(values.from), until = dateParam(values.until);
  if (from && until && from >= until) throw new OrderListFilterError("Конец периода аренды должен быть позже начала; конечная дата не включается.");
  if (type === "SALE" && values.dateField!=="created" && (from || until)) throw new OrderListFilterError("Даты относятся к периоду аренды. Для списка продаж очистите даты; фильтр даты продажи пока не задан.");
  for(const key of ["assignedMembershipId","customerId"])if(values[key]&&!(key==="assignedMembershipId"&&values[key]==="UNASSIGNED")&&!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(values[key]!))throw new OrderListFilterError("Некорректный сотрудник или клиент.");
  if(values.payment&&!["NOT_ACCRUED","NOT_REQUIRED","UNPAID","PARTIAL","PAID","OVERPAID"].includes(values.payment))throw new OrderListFilterError("Некорректный статус оплаты.");
  if(values.dateField&&!["rental","created"].includes(values.dateField))throw new OrderListFilterError("Некорректный тип периода.");
  return { assignedMembershipId:values.assignedMembershipId||undefined,customerId:values.customerId||undefined,payment:values.payment||undefined,overdue:values.overdue==="yes",dateField:values.dateField??"rental", search: values.q?.trim().slice(0, 100), status, type, branchId, source, from, until };
}
// Preserve the existing overlap rule, including one-sided intervals.
export function orderRentalPeriodWhere({ from, until, dateField }: { from?: Date; until?: Date;dateField?:string }) {
  if(dateField==="created")return {createdAt:{gte:from,lt:until}};
  return { rentalStartAt: until ? { lt: until } : undefined, rentalEndAt: from ? { gt: from } : undefined };
}
