import "server-only";

import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { getSignedProductImageUrl } from "@/lib/catalog/images";
import { hasProductOperationalHistory } from "@/lib/catalog/tracking-mode";

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
  trackingModeChangeLocked: boolean;
  publicationStatus: "DRAFT" | "ACTIVE" | "ARCHIVED";
  turnaroundBufferMinutes: number | null;
  images: Array<{ id: string; url: string | null; altText: string | null; isPrimary: boolean; sortOrder: number }>;
  executions: Array<{ id: string; code: string; name: string; sortOrder: number; isActive: boolean; images: Array<{ id: string; url: string | null; altText: string | null; isPrimary: boolean; sortOrder: number }> }>;
  variants: Array<{
    id: string;
    sku: string;
    size: string;
    execution: { id: string; code: string; name: string } | null;
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
        where: { organizationId, status: "ACTIVE", executionId: null, productVariantId: null },
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
    select: { id: true, name: true, internalCode: true, supplierModel: true, description: true, color: true, brand: true, categoryId: true, isRentable: true, isSellable: true, trackingMode: true, publicationStatus: true, turnaroundBufferMinutes: true }
  });

  if (!product) return null;
  // Keep this read path deliberately flat. Prisma's query interpreter loads deeply nested
  // relation selections concurrently, which exhausts the small Supabase session pool.
  const category = product.categoryId ? await db.category.findFirst({ where: { id: product.categoryId, organizationId }, select: { name: true } }) : null;
  const imageRows = await db.productImage.findMany({ where: { organizationId, productId: product.id, status: "ACTIVE", productVariantId: null }, select: { id: true, executionId: true, storageKey: true, altText: true, isPrimary: true, sortOrder: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const executions = await db.productExecution.findMany({ where: { organizationId, productId: product.id }, select: { id: true, code: true, name: true, sortOrder: true, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const variantRows = await db.productVariant.findMany({ where: { organizationId, productId: product.id }, select: { id: true, sku: true, isActive: true, sizeId: true, executionId: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const variantIds = variantRows.map((variant) => variant.id);
  const sizeIds = [...new Set(variantRows.map((variant) => variant.sizeId))];
  const sizes = await db.size.findMany({ where: { organizationId, id: { in: sizeIds } }, select: { id: true, code: true, sortOrder: true } });
  const prices = await db.productPrice.findMany({ where: { organizationId, productVariantId: { in: variantIds }, validFrom: { lte: now }, AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, input.defaultBranchId ? { OR: [{ branchId: input.defaultBranchId }, { branchId: null }] } : { branchId: null }] }, select: { productVariantId: true, type: true, amountMinor: true, currency: true, branchId: true, validFrom: true }, orderBy: { validFrom: "desc" } });
  const instances = await db.productInstance.findMany({ where: { organizationId, productVariantId: { in: variantIds } }, select: { id: true, productVariantId: true, inventoryNumber: true, barcode: true, operationalStatus: true, conditionStatus: true, currentBranchId: true, currentLocationId: true }, orderBy: { inventoryNumber: "asc" } });
  const stockLevels = await db.stockLevel.findMany({ where: { organizationId, productVariantId: { in: variantIds } }, select: { id: true, productVariantId: true, quantity: true, branchId: true, locationId: true, updatedAt: true }, orderBy: { updatedAt: "desc" } });
  const branchIds = [...new Set([...instances.map((instance) => instance.currentBranchId), ...stockLevels.map((level) => level.branchId)])];
  const locationIds = [...new Set([...instances.map((instance) => instance.currentLocationId), ...stockLevels.flatMap((level) => level.locationId ? [level.locationId] : [])])];
  const branches = await db.branch.findMany({ where: { organizationId, id: { in: branchIds } }, select: { id: true, name: true } });
  const locations = await db.location.findMany({ where: { organizationId, id: { in: locationIds } }, select: { id: true, name: true } });
  const trackingModeChangeLocked = await db.$transaction((tx) => hasProductOperationalHistory(tx, organizationId, product.id));
  const sizeById = new Map(sizes.map((size) => [size.id, size]));
  const executionById = new Map(executions.map((execution) => [execution.id, execution]));
  const branchById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const locationById = new Map(locations.map((location) => [location.id, location.name]));
  variantRows.sort((a, b) => (sizeById.get(a.sizeId)?.sortOrder ?? 0) - (sizeById.get(b.sizeId)?.sortOrder ?? 0) || a.id.localeCompare(b.id));

  return {
    id: product.id,
    name: product.name,
    internalCode: product.internalCode,
    supplierModel: product.supplierModel,
    description: product.description,
    color: product.color,
    categoryName: category?.name ?? null,
    hasImage: imageRows.some((image) => image.executionId === null),
    brand: product.brand, categoryId: product.categoryId, isRentable: product.isRentable,
    isSellable: product.isSellable, trackingMode: product.trackingMode, trackingModeChangeLocked,
    publicationStatus: product.publicationStatus, turnaroundBufferMinutes: product.turnaroundBufferMinutes,
    images: await Promise.all(imageRows.filter((image) => image.executionId === null).map(async (image) => ({ id: image.id, url: await getSignedProductImageUrl(image.storageKey), altText: image.altText, isPrimary: image.isPrimary, sortOrder: image.sortOrder }))),
    executions: await Promise.all(executions.map(async (execution) => ({ ...execution, images: await Promise.all(imageRows.filter((image) => image.executionId === execution.id).map(async (image) => ({ id: image.id, url: await getSignedProductImageUrl(image.storageKey), altText: image.altText, isPrimary: image.isPrimary, sortOrder: image.sortOrder }))) }))),
    variants: variantRows.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      isActive: variant.isActive,
      size: sizeById.get(variant.sizeId)?.code ?? "",
      execution: variant.executionId ? executionById.get(variant.executionId) ?? null : null,
      rentalPrice: preferredPrice(prices.filter((price) => price.productVariantId === variant.id), "RENTAL", input.defaultBranchId),
      salePrice: preferredPrice(prices.filter((price) => price.productVariantId === variant.id), "SALE", input.defaultBranchId),
      stockLevels: stockLevels.filter((level) => level.productVariantId === variant.id).map((level) => ({ id: level.id, quantity: level.quantity, branchName: branchById.get(level.branchId) ?? "", locationName: level.locationId ? locationById.get(level.locationId) ?? null : null })),
      instances: instances.filter((instance) => instance.productVariantId === variant.id && branchById.has(instance.currentBranchId) && locationById.has(instance.currentLocationId)).map((instance) => ({
        id: instance.id,
        inventoryNumber: instance.inventoryNumber,
        barcode: instance.barcode,
        operationalStatus: instance.operationalStatus,
        conditionStatus: instance.conditionStatus,
        branchName: branchById.get(instance.currentBranchId)!,
        locationName: locationById.get(instance.currentLocationId)!
      }))
    }))
  };
}

export async function getCatalogManagementOptions(tenant: TenantContext) {
  const organizationId = tenant.organizationId;
  const [categories, sizes, branches] = await Promise.all([
    db.category.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, parentId: true, sortOrder: true, status: true, _count: { select: { products: true } } } }),
    db.size.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, sizeSystem: true, recommendedHeightCm: true, lengthCm: true, sortOrder: true, isActive: true, _count: { select: { variants: true } } } }),
    db.branch.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, locations: { where: { organizationId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } } } })
  ]);
  return { categories, sizes, branches };
}
