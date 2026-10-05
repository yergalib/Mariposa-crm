import "server-only";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import type { TenantContext } from "@/lib/tenant/context";
import { requirePermission } from "@/lib/permissions/effective";
import { accessibleBranchIds } from "@/lib/staff/branch-access";
import { financeReadVisibility, visibleFinanceEffects } from "./read-visibility";

const WINDOW_DAYS = 30;
const RECENT_LIMIT = 50;

export async function getFinanceDashboard(tenant: TenantContext, actor: AuthContext) {
  if (tenant.organizationId !== actor.organizationId) throw new Error("Финансовый объект недоступен.");
  await requirePermission(actor, "FINANCE_DASHBOARD_VIEW");
  const visibility = await financeReadVisibility(actor);
  const branchIds = await accessibleBranchIds(tenant, actor.membershipId);
  if (!visibility.hasRows) return { totals: [], recent: [], windowDays: WINDOW_DAYS, recentLimit: RECENT_LIMIT, hasVisibleKinds: false };
  const branchScope = branchIds === null ? {} : { branchId: { in: branchIds } };
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const where = { organizationId: tenant.organizationId, ...branchScope, ...visibility.where };

  // Keep deposits and refunds separate from earned revenue.
  const [totals, recent] = await Promise.all([
    db.financialTransaction.groupBy({
      by: ["currency"],
      where: { ...where, occurredAt: { gte: since } },
      _sum: visibility.fields,
      _count: { _all: true },
      orderBy: { currency: "asc" },
    }),
    db.financialTransaction.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: RECENT_LIMIT,
      select: {
        id: true, kind: true, occurredAt: true, currency: true,
        amountMinor: true, orderId: true, reversal: { select: { id: true } },
        order: { select: { orderNumber: true } },
        branch: { select: { name: true, timezone: true } },
        paymentMethod: { select: { displayName: true } },
      },
    }),
  ]);
  return { totals: totals.map(row => ({ currency: row.currency, _count: row._count,
    _sum: visibleFinanceEffects(row._sum, visibility) })), recent,
    windowDays: WINDOW_DAYS, recentLimit: RECENT_LIMIT, hasVisibleKinds: visibility.hasRows };
}
