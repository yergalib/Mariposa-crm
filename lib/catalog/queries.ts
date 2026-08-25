import "server-only";

import { db } from "@/lib/db";

type PriceRow = {
  type: "RENTAL" | "SALE";
  amountMinor: bigint;
  currency: string;
  branchId: string | null;
};

export type MoneyDto = {
  amountMinor: number;
  currency: string;
};

export type CatalogCategoryDto = {
  id: string;
  name: string;
};

export type CatalogProductCardDto = {
  id: string;
  name: string;
  internalCode: string;
  supplierModel: string | null;
  color: string | null;
  categoryName: string | null;
  sizes: string[];
  rentalPrice: MoneyDto | null;
  salePrice: MoneyDto | null;
  totalInstances: number;
  availableInstances: number;
  hasImage: boolean;
};

export type CatalogProductDetailDto = {
  id: string;
  name: string;
  internalCode: string;
  supplierModel: string | null;
  description: string | null;
  color: string | null;
  categoryName: string | null;
  hasImage: boolean;
  variants: Array<{
    id: string;
    sku: string;
    size: string;
    rentalPrice: MoneyDto | null;
    salePrice: MoneyDto | null;
    instances: Array<{
      id: string;
      inventoryNumber: string;
      barcode: string;
      operationalStatus: string;
      conditionStatus: string;
      branchName: string;
      locationName: string;
    }>;
  }>;
};

function cleanSearch(value?: string) {
  const search = value?.trim();
  return search ? search.slice(0, 100) : undefined;
}

function preferredPrice(
  prices: PriceRow[],
  type: PriceRow["type"],
  branchId: string | null
): MoneyDto | null {
  const matching = prices.filter((price) => price.type === type);
  const price = matching.find((item) => item.branchId === branchId) ??
    matching.find((item) => item.branchId === null);

  return price
    ? { amountMinor: Number(price.amountMinor), currency: price.currency }
    : null;
}

export async function getCatalogCategories(organizationId: string) {
  return db.category.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
}

export async function getCatalogProducts(input: {
  organizationId: string;
  defaultBranchId: string | null;
  search?: string;
  categoryId?: string;
}): Promise<CatalogProductCardDto[]> {
  const now = new Date();
  const search = cleanSearch(input.search);

  const products = await db.product.findMany({
    where: {
      organizationId: input.organizationId,
      publicationStatus: "ACTIVE",
      archivedAt: null,
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { internalCode: { contains: search, mode: "insensitive" } },
              { variants: { some: { organizationId: input.organizationId, sku: { contains: search, mode: "insensitive" } } } }
            ]
          }
        : {})
    },
    select: {
      id: true,
      name: true,
      internalCode: true,
      supplierModel: true,
      color: true,
      category: { select: { name: true, organizationId: true } },
      images: {
        where: { organizationId: input.organizationId },
        select: { id: true },
        take: 1
      },
      variants: {
        where: {
          organizationId: input.organizationId,
          isActive: true,
          size: { organizationId: input.organizationId }
        },
        orderBy: { size: { sortOrder: "asc" } },
        select: {
          size: { select: { code: true } },
          prices: {
            where: {
              organizationId: input.organizationId,
              validFrom: { lte: now },
              AND: [
                { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
                input.defaultBranchId
                  ? { OR: [{ branchId: input.defaultBranchId }, { branchId: null }] }
                  : { branchId: null }
              ]
            },
            select: { type: true, amountMinor: true, currency: true, branchId: true },
            orderBy: { validFrom: "desc" }
          },
          instances: {
            where: { organizationId: input.organizationId },
            select: { operationalStatus: true }
          }
        }
      }
    },
    orderBy: [{ name: "asc" }, { internalCode: "asc" }]
  });

  return products.map((product) => {
    const prices = product.variants.flatMap((variant) => variant.prices);
    const instances = product.variants.flatMap((variant) => variant.instances);

    return {
      id: product.id,
      name: product.name,
      internalCode: product.internalCode,
      supplierModel: product.supplierModel,
      color: product.color,
      categoryName: product.category?.organizationId === input.organizationId
        ? product.category.name
        : null,
      sizes: product.variants.map((variant) => variant.size.code),
      rentalPrice: preferredPrice(prices, "RENTAL", input.defaultBranchId),
      salePrice: preferredPrice(prices, "SALE", input.defaultBranchId),
      totalInstances: instances.length,
      availableInstances: instances.filter((instance) => instance.operationalStatus === "AVAILABLE").length,
      hasImage: product.images.length > 0
    };
  });
}

export async function getCatalogProductById(input: {
  organizationId: string;
  defaultBranchId: string | null;
  productId: string;
}): Promise<CatalogProductDetailDto | null> {
  const now = new Date();
  const product = await db.product.findFirst({
    where: {
      id: input.productId,
      organizationId: input.organizationId,
      archivedAt: null,
      OR: [
        { categoryId: null },
        { category: { organizationId: input.organizationId } }
      ]
    },
    select: {
      id: true,
      name: true,
      internalCode: true,
      supplierModel: true,
      description: true,
      color: true,
      category: { select: { name: true, organizationId: true } },
      images: {
        where: { organizationId: input.organizationId },
        select: { id: true },
        take: 1
      },
      variants: {
        where: {
          organizationId: input.organizationId,
          isActive: true,
          size: { organizationId: input.organizationId }
        },
        orderBy: { size: { sortOrder: "asc" } },
        select: {
          id: true,
          sku: true,
          size: { select: { code: true } },
          prices: {
            where: {
              organizationId: input.organizationId,
              validFrom: { lte: now },
              AND: [
                { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
                input.defaultBranchId
                  ? { OR: [{ branchId: input.defaultBranchId }, { branchId: null }] }
                  : { branchId: null }
              ]
            },
            select: { type: true, amountMinor: true, currency: true, branchId: true },
            orderBy: { validFrom: "desc" }
          },
          instances: {
            where: {
              organizationId: input.organizationId,
              currentBranch: { organizationId: input.organizationId },
              currentLocation: { organizationId: input.organizationId }
            },
            orderBy: { inventoryNumber: "asc" },
            select: {
              id: true,
              inventoryNumber: true,
              barcode: true,
              operationalStatus: true,
              conditionStatus: true,
              currentBranch: { select: { name: true } },
              currentLocation: { select: { name: true } }
            }
          }
        }
      }
    }
  });

  if (!product) return null;

  return {
    id: product.id,
    name: product.name,
    internalCode: product.internalCode,
    supplierModel: product.supplierModel,
    description: product.description,
    color: product.color,
    categoryName: product.category?.organizationId === input.organizationId
      ? product.category.name
      : null,
    hasImage: product.images.length > 0,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      size: variant.size.code,
      rentalPrice: preferredPrice(variant.prices, "RENTAL", input.defaultBranchId),
      salePrice: preferredPrice(variant.prices, "SALE", input.defaultBranchId),
      instances: variant.instances.map((instance) => ({
        id: instance.id,
        inventoryNumber: instance.inventoryNumber,
        barcode: instance.barcode,
        operationalStatus: instance.operationalStatus,
        conditionStatus: instance.conditionStatus,
        branchName: instance.currentBranch.name,
        locationName: instance.currentLocation.name
      }))
    }))
  };
}
