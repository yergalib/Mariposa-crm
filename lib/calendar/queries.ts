import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { getVariantAvailability } from "@/lib/availability/capacity";
import {
  addLocalDays,
  dateKey,
  daysInRange,
  localDateKey,
  localParts,
  parseDateKey,
  periodFor,
  type LocalDate,
} from "@/lib/calendar/timezone";
import type { CalendarQuery } from "@/lib/calendar/validation";

export type CalendarOrderDto = {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  phone: string | null;
  branchId: string;
  branchName: string;
  status: string;
  rentalStart: Date;
  rentalEnd: Date;
  items: Array<{ name: string; variant: string; quantity: number }>;
  itemQuantity: number;
  totalMinor: bigint;
  currency: string;
  startKey: string;
  endKey: string;
};
export type CalendarDayDto = {
  key: string;
  date: LocalDate;
  starts: CalendarOrderDto[];
  ends: CalendarOrderDto[];
  active: CalendarOrderDto[];
};

async function fetchOrders(
  tenant: TenantContext,
  input: {
    rangeStart: Date;
    rangeEnd: Date;
    branchId?: string;
    branchIds?: string[];
    statuses: string[];
    search?: string;
  },
) {
  const q = input.search;
  const searchFilter: Prisma.OrderWhereInput | undefined = q ? {
    OR: [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { customer: { OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { contacts: { some: { type: "PHONE", value: { contains: q, mode: "insensitive" } } } },
      ] } },
    ],
  } : undefined;
  return db.order.findMany({
    where: {
      organizationId: tenant.organizationId,
      branchId: input.branchId ?? (input.branchIds ? { in: input.branchIds } : undefined),
      status: { in: input.statuses as never[] },
      AND: [
        {
          OR: [
            { rentalStartAt: { lt: input.rangeEnd, not: null }, rentalEndAt: { gt: input.rangeStart, not: null } },
            { rentalStartAt: { gte: input.rangeStart, lt: input.rangeEnd } },
            { rentalEndAt: { gte: input.rangeStart, lt: input.rangeEnd } },
          ],
        },
        ...(searchFilter ? [searchFilter] : []),
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      status: true,
      rentalStartAt: true,
      rentalEndAt: true,
      totalMinor: true,
      currency: true,
      branchId: true,
      branch: { select: { name: true } },
      customer: {
        select: {
          firstName: true,
          lastName: true,
          contacts: {
            where: { type: "PHONE" },
            orderBy: { isPrimary: "desc" },
            take: 1,
            select: { value: true },
          },
        },
      },
      items: {
        where: { removedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          productNameSnapshot: true,
          variantNameSnapshot: true,
          quantity: true,
        },
      },
    },
    orderBy: [{ rentalStartAt: "asc" }, { orderNumber: "asc" }],
    take: 1000,
  });
}
function dto(
  row: Awaited<ReturnType<typeof fetchOrders>>[number],
  timeZone: string,
): CalendarOrderDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerId: row.customerId,
    customerName: [row.customer.firstName, row.customer.lastName]
      .filter(Boolean)
      .join(" "),
    phone: row.customer.contacts[0]?.value ?? null,
    branchId: row.branchId,
    branchName: row.branch.name,
    status: row.status,
    rentalStart: row.rentalStartAt!,
    rentalEnd: row.rentalEndAt!,
    items: row.items.map((x) => ({
      name: x.productNameSnapshot,
      variant: x.variantNameSnapshot,
      quantity: x.quantity,
    })),
    itemQuantity: row.items.reduce((s, x) => s + x.quantity, 0),
    totalMinor: row.totalMinor,
    currency: row.currency,
    startKey: localDateKey(row.rentalStartAt!, timeZone),
    endKey: localDateKey(row.rentalEndAt!, timeZone),
  };
}
function projectDays(
  orders: CalendarOrderDto[],
  start: LocalDate,
  end: LocalDate,
  timeZone: string,
) {
  return daysInRange(start, end).map((date) => {
    const key = dateKey(date),
      dayStart = periodFor("day", date, timeZone),
      starts = orders.filter((o) => o.startKey === key),
      ends = orders.filter((o) => o.endKey === key),
      active = orders.filter(
        (o) =>
          o.rentalStart < dayStart.rangeEnd &&
          o.rentalEnd > dayStart.rangeStart,
      );
    return { key, date, starts, ends, active };
  });
}
export async function getCalendar(
  tenant: TenantContext,
  query: CalendarQuery,
  now = new Date(),
) {
  let allowedBranchIds:string[]|undefined;try{const{getCurrentSession}=await import("@/lib/auth/session"),s=await getCurrentSession();if(s?.organizationId===tenant.organizationId&&!s.hasOrganizationWideBranchAccess)allowedBranchIds=s.allowedBranchIds}catch{}
  const organization = await db.organization.findUnique({
    where: { id: tenant.organizationId },
    select: { timezone: true },
  });
  if (!organization) throw new Error("Organization not found.");
  const timeZone = organization.timezone;
  const todayParts = localParts(now, timeZone),
    today = {
      year: todayParts.year,
      month: todayParts.month,
      day: todayParts.day,
    };
  const anchor = parseDateKey(query.date) ?? today;
  if (
    query.branchId &&
    (allowedBranchIds&&!allowedBranchIds.includes(query.branchId)||!(await db.branch.findFirst({
      where: {
        id: query.branchId,
        organizationId: tenant.organizationId,
        status: "ACTIVE",
      },
      select: { id: true },
    })))
  )
    throw new Error("Филиал не найден.");
  const period = periodFor(query.view, anchor, timeZone),
    rows = await fetchOrders(tenant, {
      ...period,
      branchId: query.branchId,
      branchIds:query.branchId?undefined:allowedBranchIds,
      statuses: query.statuses,
      search: query.search,
    }),
    orders = rows.map((r) => dto(r, timeZone)),
    days = projectDays(orders, period.start, period.end, timeZone);
  const todayPeriod = periodFor("day", today, timeZone),
    todayRows = await fetchOrders(tenant, {
      ...todayPeriod,
      branchId: query.branchId,
      branchIds:query.branchId?undefined:allowedBranchIds,
      statuses: query.statuses,
    }),
    todayOrders = todayRows.map((r) => dto(r, timeZone)),
    todayDay = projectDays(
      todayOrders,
      today,
      addLocalDays(today, 1),
      timeZone,
    )[0];
  const branches = await db.branch.findMany({
    where: { organizationId: tenant.organizationId, status: "ACTIVE",id:allowedBranchIds?{in:allowedBranchIds}:undefined },
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
  let capacityWarnings: Array<{
    variantId: string;
    label: string;
    available: number;
    total: number;
  }> = [];
  if (query.view === "day") {
    const variants = await db.orderItem.findMany({
      where: {
        organizationId: tenant.organizationId,
        removedAt: null,
        order: {
          id: {
            in: orders
              .filter(
                (o) => o.status === "RESERVED" || o.status === "CONFIRMED",
              )
              .map((o) => o.id),
          },
        },
      },
      distinct: ["productVariantId"],
      select: {
        productVariantId: true,
        productNameSnapshot: true,
        variantNameSnapshot: true,
      },
      take: 100,
    });
    const branchIds = query.branchId
      ? [query.branchId]
      : branches.map((b) => b.id);
    const signals = await Promise.all(
      variants.flatMap((v) =>
        branchIds.map(async (branchId) => {
          const a = await getVariantAvailability({
            tenant,
            branchId,
            productVariantId: v.productVariantId,
            requestedFrom: period.rangeStart,
            requestedUntil: period.rangeEnd,
          });
          return {
            variantId: v.productVariantId,
            label: `${v.productNameSnapshot} · ${v.variantNameSnapshot}`,
            available: a.availableCapacity,
            total: a.totalCapacity,
          };
        }),
      ),
    );
    capacityWarnings = signals
      .filter((x) => x.available <= Math.max(0, Math.floor(x.total * 0.2)))
      .sort((a, b) => a.available - b.available);
  }
  return {
    timeZone,
    anchor,
    period,
    orders,
    days,
    today: todayDay,
    branches,
    capacityWarnings,
  };
}
