import type { Prisma } from "@/generated/prisma/client";
import { localParts, periodFor } from "@/lib/calendar/timezone";

export const ORDER_QUICK_FILTERS = {
  mine: "Мои",
  pickups: "Выдачи сегодня",
  returns: "Возвраты сегодня",
  overdue: "Просрочены",
  debt: "Есть долг",
} as const;
export type OrderQuickFilter = keyof typeof ORDER_QUICK_FILTERS;
export const ORDER_QUICK_HELP: Record<OrderQuickFilter, string> = {
  mine: "Вы назначены ответственным. Автор заказа не влияет на выборку.",
  pickups: "Плановое начало аренды сегодня по времени филиала; до полной выдачи. Готовность и возможность выдачи проверяются в заказе.",
  returns: "Плановый возврат сегодня по времени филиала; есть физически невозвращённые вещи.",
  overdue: "Срок аренды истёк; есть физически невозвращённые вещи с учётом оформленных потерь.",
  debt: "Положительный остаток обязательств по финансовым операциям. Неначисленные суммы не считаются долгом.",
};

export function todayOrderWhere(quick: "pickups" | "returns", branches: { id: string; timezone: string }[], now: Date): Prisma.OrderWhereInput {
  return {
    type: "RENTAL",
    ...(quick === "pickups" ? { status: { in: ["DRAFT", "PENDING_CONFIRMATION", "RESERVED", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "PARTIALLY_ISSUED"] } } : {}),
    OR: branches.map(branch => {
      const { rangeStart, rangeEnd } = periodFor("day", localParts(now, branch.timezone), branch.timezone);
      return { branchId: branch.id, [quick === "pickups" ? "rentalStartAt" : "rentalEndAt"]: { gte: rangeStart, lt: rangeEnd } };
    }),
  };
}

export const BOARD_PAGE_SIZE = 20;
export function workspacePage(value: unknown) {
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isSafeInteger(number) ? Math.max(1, Math.min(number, 100000)) : 1;
}
