import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { inventoryProductFilter, type InventoryArchive } from "@/lib/inventory/archive-filter";
import { warehouseStates } from "@/lib/inventory/warehouse-states";

export const BULK_PAGE_SIZE = 100;
export type BulkStockFilter = "positive" | "all" | "zero";
export function parseBulkStockFilter(value?: string): BulkStockFilter {
  return value === "positive" || value === "zero" ? value : "all";
}

export async function getWarehouseSummary(
  tenant: TenantContext,
  allowedBranchIds?: string[] | null,
  input: { search?: string; stock?: string; page?: string; archive?: InventoryArchive } = {},
) {
  const organizationId = tenant.organizationId;
  const search = input.search?.trim().slice(0, 100);
  const stock = parseBulkStockFilter(input.stock);
  const requestedPage = /^\d{1,7}$/.test(input.page ?? "") ? Math.max(1, Number(input.page)) : 1;
  const where: Prisma.StockLevelWhereInput = {
    organizationId,
    branchId: allowedBranchIds ? { in: allowedBranchIds } : undefined,
    productVariant: { organizationId, product: { organizationId, trackingMode: "BULK", ...inventoryProductFilter(input.archive ?? "current") } },
    ...(search ? { OR: [
      { productVariant: { sku: { contains: search, mode: "insensitive" } } },
      { productVariant: { product: { name: { contains: search, mode: "insensitive" } } } },
    ] } : {}),
  };

  // Count and page use the same scoped snapshot. Stable unique tie-breaker does
  // not depend on import timestamps (or quantity changing during normal work).
  return db.$transaction(async tx => {
    const grouped = await tx.stockLevel.groupBy({ by: ["productVariantId", "branchId"], where,
      _sum: { quantity: true }, orderBy: [{ productVariantId: "asc" }, { branchId: "asc" }],
      ...(stock === "positive" ? { having: { quantity: { _sum: { gt: 0 } } } } : stock === "zero" ? { having: { quantity: { _sum: { equals: 0 } } } } : {}),
    });
    const total = grouped.length;
    const pages = Math.max(1, Math.ceil(total / BULK_PAGE_SIZE));
    const page = Math.min(requestedPage, pages);
    const slice = grouped.slice((page - 1) * BULK_PAGE_SIZE, page * BULK_PAGE_SIZE);
    const levels = slice.length ? await tx.stockLevel.findMany({
      where: { AND: [where, { OR: slice.map(({ productVariantId, branchId }) => ({ productVariantId, branchId })) }] },
      include: { branch: { select: { name: true } }, location: { select: { name: true } }, productVariant: { include: { product: { select: { name: true } }, size: { select: { code: true } } } } },
      orderBy: [{ productVariant: { sku: "asc" } }, { id: "asc" }],
    }) : [];
    const states = await warehouseStates(tx, organizationId, slice.map(row => ({ productVariantId: row.productVariantId, branchId: row.branchId, quantity: row._sum.quantity ?? 0 })), new Date());
    const bulk = states.map(state => {
      const level = levels.find(row => row.productVariantId === state.productVariantId && row.branchId === state.branchId)!;
      return { ...level, ...state, id: `${state.productVariantId}:${state.branchId}` };
    });
    return { bulk, total, units: grouped.reduce((sum, row) => sum + (row._sum.quantity ?? 0), 0), page, pages, stock,
      first: total ? (page - 1) * BULK_PAGE_SIZE + 1 : 0,
      last: total ? (page - 1) * BULK_PAGE_SIZE + bulk.length : 0 };
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
}
