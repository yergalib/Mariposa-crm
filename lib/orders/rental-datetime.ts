import "server-only";

import { parseBusinessLocalDateTime } from "@/lib/calendar/timezone";
import { db } from "@/lib/db";
import { OrderError } from "@/lib/orders/errors";
import type { TenantContext } from "@/lib/tenant/context";

export async function parseRentalPeriodForBranch(tenant: TenantContext, input: { branchId: string; rentalStart: string; rentalEnd: string }) {
  const branch = await db.branch.findFirst({ where: { id: input.branchId, organizationId: tenant.organizationId, status: "ACTIVE" }, select: { timezone: true } });
  if (!branch) throw new OrderError("VALIDATION", "Филиал не найден или недоступен.");
  try {
    const rentalStart = parseBusinessLocalDateTime(input.rentalStart, branch.timezone), rentalEnd = parseBusinessLocalDateTime(input.rentalEnd, branch.timezone);
    if (rentalEnd <= rentalStart) throw new OrderError("VALIDATION", "Дата окончания должна быть позже даты начала.");
    return { rentalStart, rentalEnd, timeZone: branch.timezone };
  } catch (error) {
    if (error instanceof OrderError) throw error;
    throw new OrderError("VALIDATION", error instanceof Error ? error.message : "Проверьте период аренды.");
  }
}
