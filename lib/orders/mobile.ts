import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getVariantAvailabilityWithClient } from "@/lib/availability/capacity";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";

const sizeSelect = {
  code: true,
  name: true,
  sizeSystem: true,
  recommendedHeightCm: true,
  lengthCm: true,
} as const;

export type RentalVariantQuote = {
  variantId: string;
  sku: string;
  trackingMode: "BULK" | "SERIALIZED";
  product: { id: string; name: string; code: string };
  execution: { id: string; name: string } | null;
  size: {
    code: string;
    name: string;
    sizeSystem: string;
    recommendedHeightCm: number | null;
    lengthCm: number | null;
  };
  priceMinor: string | null;
  currency: string;
  totalCapacity: number;
  availableCapacity: number;
  requestedQuantity: number;
  canFulfill: boolean;
};

type RentalContext = {
  branchId: string;
  requestedFrom: Date;
  requestedUntil: Date;
  quantity: number;
};

const priceWhere = (organizationId: string, branchId: string, now: Date) => ({
  organizationId,
  type: "RENTAL" as const,
  validFrom: { lte: now },
  AND: [
    { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
    { OR: [{ branchId }, { branchId: null }] },
  ],
});

async function quoteRows(
  tx: Prisma.TransactionClient,
  tenant: TenantContext,
  rows: Array<{
    id: string;
    sku: string;
    product: { id: string; name: string; internalCode: string; trackingMode: "BULK" | "SERIALIZED" };
    execution: { id: string; name: string } | null;
    size: RentalVariantQuote["size"];
    prices: Array<{ amountMinor: bigint; currency: string }>;
  }>,
  context: RentalContext,
) {
  const results: RentalVariantQuote[] = [];
  for (const row of rows) {
    const availability = await getVariantAvailabilityWithClient(tx, {
      tenant,
      branchId: context.branchId,
      productVariantId: row.id,
      requestedFrom: context.requestedFrom,
      requestedUntil: context.requestedUntil,
      requestedQuantity: context.quantity,
    });
    results.push({
      variantId: row.id,
      sku: row.sku,
      trackingMode: row.product.trackingMode,
      product: { id: row.product.id, name: row.product.name, code: row.product.internalCode },
      execution: row.execution,
      size: row.size,
      priceMinor: row.prices[0]?.amountMinor.toString() ?? null,
      currency: row.prices[0]?.currency ?? "KZT",
      totalCapacity: availability.totalCapacity,
      availableCapacity: availability.availableCapacity,
      requestedQuantity: context.quantity,
      canFulfill: availability.canFulfill,
    });
  }
  return results;
}

export async function searchRentalCustomers(tenant: TenantContext, rawQuery: string) {
  const query = rawQuery.trim().slice(0, 100);
  if (query.length < 2) return [];
  return db.customer.findMany({
    where: {
      organizationId: tenant.organizationId,
      status: "ACTIVE",
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { customerNumber: { contains: query, mode: "insensitive" } },
        { contacts: { some: { value: { contains: query, mode: "insensitive" } } } },
      ],
    },
    select: {
      id: true,
      customerNumber: true,
      firstName: true,
      lastName: true,
      contacts: { where: { type: "PHONE" }, select: { value: true }, orderBy: { isPrimary: "desc" }, take: 1 },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 20,
  });
}

export async function searchRentalVariants(
  tenant: TenantContext,
  rawQuery: string,
  context: RentalContext,
) {
  const query = rawQuery.trim().slice(0, 100);
  if (query.length < 2) return [];
  const now = new Date();
  return db.$transaction(async (tx) => {
    const rows = await tx.productVariant.findMany({
      where: {
        organizationId: tenant.organizationId,
        isActive: true,
        product: { archivedAt: null, publicationStatus: "ACTIVE", isRentable: true },
        OR: [
          { sku: { contains: query, mode: "insensitive" } },
          { product: { name: { contains: query, mode: "insensitive" } } },
          { product: { internalCode: { contains: query, mode: "insensitive" } } },
          { execution: { name: { contains: query, mode: "insensitive" } } },
          { size: { code: { contains: query, mode: "insensitive" } } },
          { size: { name: { contains: query, mode: "insensitive" } } },
        ],
      },
      select: {
        id: true,
        sku: true,
        product: { select: { id: true, name: true, internalCode: true, trackingMode: true } },
        execution: { select: { id: true, name: true } },
        size: { select: sizeSelect },
        prices: {
          where: priceWhere(tenant.organizationId, context.branchId, now),
          orderBy: [{ branchId: "desc" }, { validFrom: "desc" }],
          take: 1,
          select: { amountMinor: true, currency: true },
        },
      },
      orderBy: [{ product: { name: "asc" } }, { execution: { sortOrder: "asc" } }, { size: { sortOrder: "asc" } }],
      take: 30,
    });
    return quoteRows(tx, tenant, rows, context);
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });
}

export async function quoteRentalVariant(
  tenant: TenantContext,
  variantId: string,
  context: RentalContext,
) {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const row = await tx.productVariant.findFirst({
      where: {
        id: variantId,
        organizationId: tenant.organizationId,
        isActive: true,
        product: { archivedAt: null, publicationStatus: "ACTIVE", isRentable: true },
      },
      select: {
        id: true,
        sku: true,
        product: { select: { id: true, name: true, internalCode: true, trackingMode: true } },
        execution: { select: { id: true, name: true } },
        size: { select: sizeSelect },
        prices: {
          where: priceWhere(tenant.organizationId, context.branchId, now),
          orderBy: [{ branchId: "desc" }, { validFrom: "desc" }],
          take: 1,
          select: { amountMinor: true, currency: true },
        },
      },
    });
    if (!row) return null;
    return (await quoteRows(tx, tenant, [row], context))[0] ?? null;
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 20_000 });
}
