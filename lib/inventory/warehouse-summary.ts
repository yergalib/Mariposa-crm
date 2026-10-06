import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";

export const BULK_PAGE_SIZE = 100;
export type BulkStockFilter = "positive" | "all" | "zero";
export function parseBulkStockFilter(value?: string): BulkStockFilter {
  return value === "all" || value === "zero" ? value : "positive";
}

export async function getWarehouseSummary(
  tenant: TenantContext,
  allowedBranchIds?: string[] | null,
  input: { search?: string; stock?: string; page?: string } = {},
) {
  const organizationId = tenant.organizationId;
  const search = input.search?.trim().slice(0, 100);
  const stock = parseBulkStockFilter(input.stock);
  const requestedPage = /^\d{1,7}$/.test(input.page ?? "") ? Math.max(1, Number(input.page)) : 1;
  const where: Prisma.StockLevelWhereInput = {
    organizationId,
    branchId: allowedBranchIds ? { in: allowedBranchIds } : undefined,
    productVariant: { organizationId, product: { organizationId, trackingMode: "BULK" } },
    ...(stock === "positive" ? { quantity: { gt: 0 } } : stock === "zero" ? { quantity: 0 } : {}),
    ...(search ? { OR: [
      { productVariant: { sku: { contains: search, mode: "insensitive" } } },
      { productVariant: { product: { name: { contains: search, mode: "insensitive" } } } },
    ] } : {}),
  };

  // Count and page use the same scoped snapshot. Stable unique tie-breaker does
  // not depend on import timestamps (or quantity changing during normal work).
  return db.$transaction(async tx => {
    const totals = await tx.stockLevel.aggregate({ where, _count: { _all: true }, _sum: { quantity: true } });
    const total = totals._count._all;
    const pages = Math.max(1, Math.ceil(total / BULK_PAGE_SIZE));
    const page = Math.min(requestedPage, pages);
    const bulk = await tx.stockLevel.findMany({
      where,
      include: { branch: { select: { name: true } }, location: { select: { name: true } }, productVariant: { include: { product: { select: { name: true } }, size: { select: { code: true } } } } },
      orderBy: [{ productVariant: { sku: "asc" } }, { id: "asc" }],
      skip: (page - 1) * BULK_PAGE_SIZE,
      take: BULK_PAGE_SIZE,
    });
    return { bulk, total, units: totals._sum.quantity ?? 0, page, pages, stock,
      first: total ? (page - 1) * BULK_PAGE_SIZE + 1 : 0,
      last: total ? (page - 1) * BULK_PAGE_SIZE + bulk.length : 0 };
  }, { isolationLevel: "RepeatableRead" });
}
