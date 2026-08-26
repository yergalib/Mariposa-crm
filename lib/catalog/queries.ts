import "server-only";

import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { getSignedProductImageUrl } from "@/lib/catalog/images";

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
  imageUrl: string | null;
  trackingMode: "SERIALIZED" | "BULK";
  publicationStatus: "DRAFT" | "ACTIVE" | "ARCHIVED";
  totalStock: number;
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
  brand: string | null;
  categoryId: string | null;
  isRentable: boolean;
  isSellable: boolean;
  trackingMode: "SERIALIZED" | "BULK";
  publicationStatus: "DRAFT" | "ACTIVE" | "ARCHIVED";
  turnaroundBufferMinutes: number | null;
  images: Array<{ id: string; url: string | null; altText: string | null; isPrimary: boolean; sortOrder: number }>;
  variants: Array<{
    id: string;
    sku: string;
    size: string;
    isActive: boolean;
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
    stockLevels: Array<{ id: string; quantity: number; branchName: string; locationName: string | null }>;
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

export async function getCatalogCategories(tenant: TenantContext) {
  return db.category.findMany({
    where: { organizationId: tenant.organizationId, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
}

export async function getCatalogProducts(input: {
  tenant: TenantContext;
  defaultBranchId: string | null;
  search?: string;
  categoryId?: string;
  includeArchived?: boolean;
}): Promise<CatalogProductCardDto[]> {
  const now = new Date();
  const search = cleanSearch(input.search);
  const organizationId = input.tenant.organizationId;

  const products = await db.product.findMany({
    where: {
      organizationId,
      ...(input.includeArchived ? {} : { publicationStatus: "ACTIVE", archivedAt: null }),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { internalCode: { contains: search, mode: "insensitive" } },
              { variants: { some: { organizationId, sku: { contains: search, mode: "insensitive" } } } }
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
      trackingMode: true,
      publicationStatus: true,
      category: { select: { name: true, organizationId: true } },
      images: {
        where: { organizationId, status: "ACTIVE" },
        select: { id: true, storageKey: true },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1
      },
      variants: {
        where: {
          organizationId,
          isActive: true,
          size: { organizationId }
        },
        orderBy: { size: { sortOrder: "asc" } },
        select: {
          size: { select: { code: true } },
          prices: {
            where: {
              organizationId,
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
            where: { organizationId },
            select: { operationalStatus: true }
          },
          stockLevels: { where: { organizationId }, select: { quantity: true } }
        }
      }
    },
    orderBy: [{ name: "asc" }, { internalCode: "asc" }]
  });

  return Promise.all(products.map(async (product) => {
    const prices = product.variants.flatMap((variant) => variant.prices);
    const instances = product.variants.flatMap((variant) => variant.instances);
    const totalStock = product.variants.flatMap((variant) => variant.stockLevels).reduce((sum, level) => sum + level.quantity, 0);

    return {
      id: product.id,
      name: product.name,
      internalCode: product.internalCode,
      supplierModel: product.supplierModel,
      color: product.color,
      categoryName: product.category?.organizationId === organizationId
        ? product.category.name
        : null,
      sizes: product.variants.map((variant) => variant.size.code),
      rentalPrice: preferredPrice(prices, "RENTAL", input.defaultBranchId),
      salePrice: preferredPrice(prices, "SALE", input.defaultBranchId),
      totalInstances: instances.length,
      availableInstances: instances.filter((instance) => instance.operationalStatus === "AVAILABLE").length,
      hasImage: product.images.length > 0
      ,imageUrl: product.images[0] ? await getSignedProductImageUrl(product.images[0].storageKey) : null,
      trackingMode: product.trackingMode,
      publicationStatus: product.publicationStatus,
      totalStock
    };
  }));
}

export async function getCatalogProductById(input: {
  tenant: TenantContext;
  defaultBranchId: string | null;
  productId: string;
}): Promise<CatalogProductDetailDto | null> {
  const now = new Date();
  const organizationId = input.tenant.organizationId;
  const product = await db.product.findFirst({
    where: {
      id: input.productId,
      organizationId,
      OR: [
        { categoryId: null },
        { category: { organizationId } }
      ]
    },
    select: {
      id: true,
      name: true,
      internalCode: true,
      supplierModel: true,
      description: true,
      color: true,
      brand: true, categoryId: true, isRentable: true, isSellable: true, trackingMode: true,
      publicationStatus: true, turnaroundBufferMinutes: true,
      category: { select: { name: true, organizationId: true } },
      images: {
        where: { organizationId, status: "ACTIVE" },
        select: { id: true, storageKey: true, altText: true, isPrimary: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      },
      variants: {
        where: {
          organizationId,
          size: { organizationId }
        },
        orderBy: { size: { sortOrder: "asc" } },
        select: {
          id: true,
          sku: true,
          isActive: true,
          size: { select: { code: true } },
          prices: {
            where: {
              organizationId,
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
              organizationId,
              currentBranch: { organizationId },
              currentLocation: { organizationId }
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
          },
          stockLevels: { where: { organizationId }, orderBy: { updatedAt: "desc" }, select: { id: true, quantity: true, branch: { select: { name: true } }, location: { select: { name: true } } } }
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
    categoryName: product.category?.organizationId === organizationId
      ? product.category.name
      : null,
    hasImage: product.images.length > 0,
    brand: product.brand, categoryId: product.categoryId, isRentable: product.isRentable,
    isSellable: product.isSellable, trackingMode: product.trackingMode,
    publicationStatus: product.publicationStatus, turnaroundBufferMinutes: product.turnaroundBufferMinutes,
    images: await Promise.all(product.images.map(async (image) => ({ id: image.id, url: await getSignedProductImageUrl(image.storageKey), altText: image.altText, isPrimary: image.isPrimary, sortOrder: image.sortOrder }))),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      isActive: variant.isActive,
      size: variant.size.code,
      rentalPrice: preferredPrice(variant.prices, "RENTAL", input.defaultBranchId),
      salePrice: preferredPrice(variant.prices, "SALE", input.defaultBranchId),
      stockLevels: variant.stockLevels.map((level) => ({ id: level.id, quantity: level.quantity, branchName: level.branch.name, locationName: level.location?.name ?? null })),
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

export async function getCatalogManagementOptions(tenant: TenantContext) {
  const organizationId = tenant.organizationId;
  const [categories, sizes, branches] = await Promise.all([
    db.category.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, parentId: true, sortOrder: true, status: true, _count: { select: { products: true } } } }),
    db.size.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, sizeSystem: true, sortOrder: true, isActive: true, _count: { select: { variants: true } } } }),
    db.branch.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, locations: { where: { organizationId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } } } })
  ]);
  return { categories, sizes, branches };
}
