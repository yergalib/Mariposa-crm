import "server-only";
import { effectivePriceOrder } from "@/lib/catalog/price-order";
import { variantOperationWhere } from "@/lib/catalog/operation-policy";

import type { Prisma } from "@/generated/prisma/client";
import { getPermanentFleetReductionAvailabilityWithClient } from "@/lib/availability/capacity";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";

const meaningfulLength = (value: string) => (value.match(/[\p{L}\p{N}]/gu) ?? []).length;

const sizeSelect = {
  code: true,
  name: true,
  sizeSystem: true,
  recommendedHeightCm: true,
  lengthCm: true,
} as const;

export type SaleVariantQuote = {
  variantId: string;
  sku: string;
  trackingMode: "BULK" | "SERIALIZED";
  product: { id: string; name: string; code: string };
  execution: { id: string; name: string } | null;
  size: { code: string; name: string; sizeSystem: string; recommendedHeightCm: number | null; lengthCm: number | null };
  defaultPriceMinor: string | null;
  currency: string;
  availableCapacity: number;
  canFulfill: boolean;
  availableInstances: Array<{ id: string; inventoryNumber: string; barcode: string }>;
};

type Row = {
  id: string;
  sku: string;
  product: { id: string; name: string; internalCode: string; trackingMode: "BULK" | "SERIALIZED" };
  execution: { id: string; name: string } | null;
  size: SaleVariantQuote["size"];
  prices: Array<{ amountMinor: bigint; currency: string }>;
};

const rowSelect = (organizationId: string, branchId: string, now: Date) => ({
  id: true,
  sku: true,
  product: { select: { id: true, name: true, internalCode: true, trackingMode: true } },
  execution: { select: { id: true, name: true } },
  size: { select: sizeSelect },
  prices: {
    where: {
      organizationId,
      type: "SALE" as const,
      validFrom: { lte: now },
      AND: [
        { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        { OR: [{ branchId }, { branchId: null }] },
      ],
    },
    orderBy: effectivePriceOrder,
    take: 1,
    select: { amountMinor: true, currency: true },
  },
}) satisfies Prisma.ProductVariantSelect;

async function quoteRows(tx: Prisma.TransactionClient, tenant: TenantContext, branchId: string, rows: Row[]) {
  const now = new Date();
  const quotes: SaleVariantQuote[] = [];
  for (const row of rows) {
    const price = row.prices[0];
    const availability = await getPermanentFleetReductionAvailabilityWithClient(tx, {
      tenant,
      branchId,
      productVariantId: row.id,
      quantity: 1,
      confirmedAt: now,
    });
    const availableInstances = row.product.trackingMode === "SERIALIZED"
      ? await tx.productInstance.findMany({
          where: {
            organizationId: tenant.organizationId,
            productVariantId: row.id,
            currentBranchId: branchId,
            operationalStatus: "AVAILABLE",
            retiredAt: null,
            saleInventoryCommitments: { none: { status: "ACTIVE" } },
            capacityAllocations: { none: { status: "ACTIVE", OR: [{ blockedUntil: null }, { blockedUntil: { gt: now } }] } },
          },
          select: { id: true, inventoryNumber: true, barcode: true },
          orderBy: { inventoryNumber: "asc" },
          take: 12,
        })
      : [];
    quotes.push({
      variantId: row.id,
      sku: row.sku,
      trackingMode: row.product.trackingMode,
      product: { id: row.product.id, name: row.product.name, code: row.product.internalCode },
      execution: row.execution,
      size: row.size,
      defaultPriceMinor: price?.amountMinor.toString() ?? null,
      currency: price?.currency ?? "KZT",
      availableCapacity: availability.availableCapacity,
      canFulfill: availability.canFulfill,
      availableInstances,
    });
  }
  return quotes;
}

export async function searchSaleVariants(tenant: TenantContext, rawQuery: string, branchId: string) {
  const query = rawQuery.trim().slice(0, 100);
  if (meaningfulLength(query) < 3) return [];
  const now = new Date();
  return db.$transaction(async (tx) => {
    const select = rowSelect(tenant.organizationId, branchId, now);
    const base = {
      ...variantOperationWhere(tenant.organizationId, "SALE"),
    };
    const identifierRows = await tx.productVariant.findMany({
      where: { ...base, OR: [{ sku: { contains: query, mode: "insensitive" } }, { product: { internalCode: { contains: query, mode: "insensitive" } } }] },
      select,
      orderBy: [{ product: { name: "asc" } }, { execution: { sortOrder: "asc" } }, { size: { sortOrder: "asc" } }],
      take: 12,
    });
    const identifiers = identifierRows.map((row) => row.id);
    const numeric = /^\s*\d[\d\s+().-]*\s*$/.test(query);
    const nameRows = await tx.productVariant.findMany({
      where: {
        ...base,
        id: identifiers.length ? { notIn: identifiers } : undefined,
        OR: [
          { product: { name: { contains: query, mode: "insensitive" } } },
          ...(numeric ? [] : [{ execution: { name: { contains: query, mode: "insensitive" as const } } }]),
        ],
      },
      select,
      orderBy: [{ product: { name: "asc" } }, { execution: { sortOrder: "asc" } }, { size: { sortOrder: "asc" } }],
      take: Math.max(0, 24 - identifierRows.length),
    });
    return quoteRows(tx, tenant, branchId, [...identifierRows, ...nameRows]);
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });
}

export async function quoteSaleVariant(tenant: TenantContext, branchId: string, variantId: string) {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const row = await tx.productVariant.findFirst({
      where: { id: variantId, ...variantOperationWhere(tenant.organizationId, "SALE") },
      select: rowSelect(tenant.organizationId, branchId, now),
    });
    return row ? (await quoteRows(tx, tenant, branchId, [row]))[0] ?? null : null;
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 20_000 });
}
