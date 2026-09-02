import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CatalogError } from "@/lib/catalog/errors";
import { categoryInputSchema, productInputSchema, sizeInputSchema, variantInputSchema } from "@/lib/catalog/validation";
import type { TenantContext } from "@/lib/tenant/context";

function duplicateError(error: unknown, kind: "PRODUCT" | "VARIANT" | "SIZE") {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    if (kind === "PRODUCT") return new CatalogError("DUPLICATE_INTERNAL_CODE", "Товар с таким внутренним кодом уже существует.");
    if (kind === "VARIANT") return new CatalogError("DUPLICATE_SKU", "SKU или размер уже используется этим товаром.");
    return new CatalogError("VALIDATION", "Размер с таким кодом уже существует.");
  }
  return error;
}

async function validateCategory(organizationId: string, categoryId: string | null) {
  if (!categoryId) return;
  const category = await db.category.findFirst({ where: { id: categoryId, organizationId }, select: { id: true } });
  if (!category) throw new CatalogError("NOT_FOUND", "Категория не найдена.");
}

export async function createProduct(tenant: TenantContext, raw: unknown) {
  const data = productInputSchema.parse(raw);
  await validateCategory(tenant.organizationId, data.categoryId);
  try {
    return await db.product.create({ data: { ...data, organizationId: tenant.organizationId } });
  } catch (error) {
    throw duplicateError(error, "PRODUCT");
  }
}

export async function updateProduct(tenant: TenantContext, productId: string, raw: unknown) {
  const data = productInputSchema.parse(raw);
  await validateCategory(tenant.organizationId, data.categoryId);
  try {
    return await db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, organizationId: tenant.organizationId }, select: { trackingMode: true, _count: { select: { variants: true } } } });
      if (!product) throw new CatalogError("NOT_FOUND", "Товар не найден.");
      if (product.trackingMode !== data.trackingMode) {
        if (product.trackingMode === "SERIALIZED") {
          const count = await tx.productInstance.count({ where: { organizationId: tenant.organizationId, productVariant: { productId } } });
          if (count > 0) throw new CatalogError("TRACKING_MODE_CONFLICT", "Нельзя включить количественный учёт: у товара есть физические экземпляры.");
        } else {
          const stock = await tx.stockLevel.aggregate({ where: { organizationId: tenant.organizationId, productVariant: { productId } }, _sum: { quantity: true } });
          if ((stock._sum.quantity ?? 0) > 0) throw new CatalogError("TRACKING_MODE_CONFLICT", "Нельзя включить поэкземплярный учёт: у товара есть остаток.");
        }
      }
      return tx.product.update({ where: { id: productId }, data: { ...data, archivedAt: data.publicationStatus === "ARCHIVED" ? new Date() : null } });
    });
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw duplicateError(error, "PRODUCT");
  }
}

export async function archiveProduct(tenant: TenantContext, productId: string) {
  const result = await db.product.updateMany({ where: { id: productId, organizationId: tenant.organizationId }, data: { publicationStatus: "ARCHIVED", archivedAt: new Date() } });
  if (!result.count) throw new CatalogError("NOT_FOUND", "Товар не найден.");
}

export async function createCategory(tenant: TenantContext, raw: unknown) {
  const data = categoryInputSchema.parse(raw);
  await validateCategory(tenant.organizationId, data.parentId);
  return db.category.create({ data: { ...data, slug: `category-${randomUUID()}`, organizationId: tenant.organizationId } });
}

export async function updateCategory(tenant: TenantContext, categoryId: string, raw: unknown) {
  const data = categoryInputSchema.parse(raw);
  if (data.parentId === categoryId) throw new CatalogError("VALIDATION", "Категория не может быть собственным родителем.");
  await validateCategory(tenant.organizationId, data.parentId);
  let ancestorId = data.parentId;
  while (ancestorId) {
    if (ancestorId === categoryId) throw new CatalogError("VALIDATION", "Нельзя переместить категорию внутрь её дочерней категории.");
    const ancestor = await db.category.findFirst({ where: { id: ancestorId, organizationId: tenant.organizationId }, select: { parentId: true } });
    ancestorId = ancestor?.parentId ?? null;
  }
  const result = await db.category.updateMany({ where: { id: categoryId, organizationId: tenant.organizationId }, data });
  if (!result.count) throw new CatalogError("NOT_FOUND", "Категория не найдена.");
}

export async function createSize(tenant: TenantContext, raw: unknown) {
  const data = sizeInputSchema.parse(raw);
  try {
    return await db.size.create({ data: { ...data, organizationId: tenant.organizationId } });
  } catch (error) {
    throw duplicateError(error, "SIZE");
  }
}

export async function updateSize(tenant: TenantContext, sizeId: string, raw: unknown) {
  const data = sizeInputSchema.parse(raw);
  try {
    const result = await db.size.updateMany({ where: { id: sizeId, organizationId: tenant.organizationId }, data });
    if (!result.count) throw new CatalogError("NOT_FOUND", "Размер не найден.");
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw duplicateError(error, "SIZE");
  }
}

export async function addVariant(tenant: TenantContext, raw: unknown) {
  const data = variantInputSchema.parse(raw);
  const [product, size] = await Promise.all([
    db.product.findFirst({ where: { id: data.productId, organizationId: tenant.organizationId }, select: { id: true } }),
    db.size.findFirst({ where: { id: data.sizeId, organizationId: tenant.organizationId, isActive: true }, select: { id: true } })
  ]);
  if (!product || !size) throw new CatalogError("NOT_FOUND", "Товар или размер не найден.");
  try {
    return await db.productVariant.create({ data: { ...data, organizationId: tenant.organizationId } });
  } catch (error) {
    throw duplicateError(error, "VARIANT");
  }
}

export async function setVariantActive(tenant: TenantContext, variantId: string, isActive: boolean) {
  const result = await db.productVariant.updateMany({ where: { id: variantId, organizationId: tenant.organizationId }, data: { isActive } });
  if (!result.count) throw new CatalogError("NOT_FOUND", "Вариант не найден.");
}

export async function replaceCurrentPrice(tenant: TenantContext, input: { variantId: string; branchId: string | null; type: "RENTAL" | "SALE"; amountMinor: bigint; currency: string }) {
  if (input.amountMinor < BigInt(0) || !/^[A-Z]{3}$/.test(input.currency)) throw new CatalogError("VALIDATION", "Некорректная цена или валюта.");
  return db.$transaction(async (tx) => {
    const variant = await tx.productVariant.findFirst({ where: { id: input.variantId, organizationId: tenant.organizationId }, select: { id: true } });
    if (!variant) throw new CatalogError("NOT_FOUND", "Вариант не найден.");
    if (input.branchId) {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: tenant.organizationId }, select: { id: true } });
      if (!branch) throw new CatalogError("NOT_FOUND", "Филиал не найден.");
    }
    const now = new Date();
    await tx.productPrice.updateMany({ where: { organizationId: tenant.organizationId, productVariantId: input.variantId, branchId: input.branchId, type: input.type, validUntil: null }, data: { validUntil: now } });
    return tx.productPrice.create({ data: { organizationId: tenant.organizationId, productVariantId: input.variantId, branchId: input.branchId, type: input.type, amountMinor: input.amountMinor, currency: input.currency, validFrom: now } });
  });
}

export async function createSerializedInstances(tenant: TenantContext, input: { variantId: string; branchId: string; locationId: string; quantity: number; purchaseCostMinor?: bigint; notes?: string | null }) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) throw new CatalogError("VALIDATION", "Количество должно быть от 1 до 100.");
  return db.$transaction(async (tx) => {
    const variant = await tx.productVariant.findFirst({ where: { id: input.variantId, organizationId: tenant.organizationId, product: { trackingMode: "SERIALIZED" } }, select: { id: true } });
    const location = await tx.location.findFirst({ where: { id: input.locationId, organizationId: tenant.organizationId, branchId: input.branchId, isActive: true }, select: { id: true } });
    if (!variant || !location) throw new CatalogError("NOT_FOUND", "Вариант или место хранения не найдено.");
    const rows = await tx.$queryRaw<Array<{ start_value: bigint }>>(Prisma.sql`
      INSERT INTO "inventory_counters" ("organization_id", "next_value", "updated_at")
      VALUES (${tenant.organizationId}::uuid, ${BigInt(input.quantity) + BigInt(1)}, CURRENT_TIMESTAMP)
      ON CONFLICT ("organization_id") DO UPDATE
      SET "next_value" = "inventory_counters"."next_value" + ${BigInt(input.quantity)}, "updated_at" = CURRENT_TIMESTAMP
      RETURNING "next_value" - ${BigInt(input.quantity)} AS "start_value"
    `);
    const start = rows[0]?.start_value;
    if (!start) throw new CatalogError("VALIDATION", "Не удалось выделить номера экземпляров.");
    const values = Array.from({ length: input.quantity }, (_, index) => {
      const number = start + BigInt(index);
      return {
        organizationId: tenant.organizationId,
        productVariantId: input.variantId,
        inventoryNumber: `INV-${number.toString().padStart(6, "0")}`,
        barcode: `MI${number.toString().padStart(10, "0")}`,
        homeBranchId: input.branchId,
        currentBranchId: input.branchId,
        currentLocationId: input.locationId,
        purchaseCostMinor: input.purchaseCostMinor,
        currency: input.purchaseCostMinor == null ? null : "KZT",
        notes: input.notes?.trim() || null
      };
    });
    await tx.productInstance.createMany({ data: values });
    return values;
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function adjustBulkStock(tenant: TenantContext, input: { variantId: string; branchId: string; locationId: string | null; delta: number; reason: string; userId?: string }) {
  if (!Number.isInteger(input.delta) || input.delta === 0 || !input.reason.trim()) throw new CatalogError("VALIDATION", "Укажите ненулевую корректировку и причину.");
  return db.$transaction(async (tx) => {
    const lockKey = `${tenant.organizationId}:${input.branchId}:${input.variantId}:${input.locationId ?? "branch"}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const variant = await tx.productVariant.findFirst({ where: { id: input.variantId, organizationId: tenant.organizationId, product: { trackingMode: "BULK" } }, select: { id: true } });
    const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: tenant.organizationId }, select: { id: true } });
    const location = input.locationId ? await tx.location.findFirst({ where: { id: input.locationId, organizationId: tenant.organizationId, branchId: input.branchId }, select: { id: true } }) : null;
    if (!variant || !branch || (input.locationId && !location)) throw new CatalogError("NOT_FOUND", "Вариант или место хранения не найдено.");
    let level = await tx.stockLevel.findFirst({ where: { organizationId: tenant.organizationId, productVariantId: input.variantId, branchId: input.branchId, locationId: input.locationId } });
    const current = level?.quantity ?? 0;
    const resulting = current + input.delta;
    if (resulting < 0) throw new CatalogError("NEGATIVE_STOCK", "Остаток не может быть отрицательным.");
    level = level
      ? await tx.stockLevel.update({ where: { id: level.id }, data: { quantity: resulting } })
      : await tx.stockLevel.create({ data: { organizationId: tenant.organizationId, productVariantId: input.variantId, branchId: input.branchId, locationId: input.locationId, quantity: resulting } });
    await tx.stockAdjustment.create({ data: { organizationId: tenant.organizationId, stockLevelId: level.id, type: current === 0 ? "INITIAL" : "CORRECTION", delta: input.delta, resultingQuantity: resulting, reason: input.reason.trim().slice(0, 500), createdByUserId: input.userId } });
    await tx.inventoryMovement.create({ data: { organizationId: tenant.organizationId, productVariantId: input.variantId, type: current === 0 ? "INITIAL" : "ADJUSTMENT", quantity: input.delta, fromBranchId: input.delta < 0 ? input.branchId : null, fromLocationId: input.delta < 0 ? input.locationId : null, toBranchId: input.delta > 0 ? input.branchId : null, toLocationId: input.delta > 0 ? input.locationId : null, sourceType: "LEGACY_STOCK_ADJUSTMENT", reason: input.reason.trim().slice(0, 500), createdByUserId: input.userId } });
    return level;
  }, { maxWait: 10_000, timeout: 30_000 });
}
