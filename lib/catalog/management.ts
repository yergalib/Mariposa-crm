import {auditedMutation,type AuditActor} from "@/lib/audit/mutation";
import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CatalogError } from "@/lib/catalog/errors";
import { categoryInputSchema, executionInputSchema, productInputSchema, sizeInputSchema, variantInputSchema } from "@/lib/catalog/validation";
import type { TenantContext } from "@/lib/tenant/context";
import { buildExecutionVariantSku, buildVariantSku, normalizeScannableCode } from "@/lib/catalog/scannable-code";
import { hasProductOperationalHistory } from "@/lib/catalog/tracking-mode";
import { changeBulk, receiveSerialized } from "@/lib/inventory/management";
import { workflowScope, type WorkflowActor } from "@/lib/workflow-access";
import { appendAuditLog } from "@/lib/audit/log";


function duplicateError(error: unknown, kind: "PRODUCT" | "VARIANT" | "SIZE") {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    if (kind === "PRODUCT") return new CatalogError("DUPLICATE_INTERNAL_CODE", "Товар с таким внутренним кодом уже существует.");
    if (kind === "VARIANT") return new CatalogError("DUPLICATE_SKU", "SKU или размер уже используется этим товаром.");
    return new CatalogError("VALIDATION", "Размер с таким кодом уже существует.");
  }
  return error;
}

async function validateCategory(tx: Prisma.TransactionClient, organizationId: string, categoryId: string | null) {
  if (!categoryId) return;
  const category = await tx.category.findFirst({ where: { id: categoryId, organizationId }, select: { id: true } });
  if (!category) throw new CatalogError("NOT_FOUND", "Категория не найдена.");
}

async function createProductWithClient(tx:Prisma.TransactionClient,tenant: TenantContext,raw: unknown) {
  const data = productInputSchema.parse(raw);
  await validateCategory(tx, tenant.organizationId, data.categoryId);
  try {
    return await tx.product.create({ data: { ...data, organizationId: tenant.organizationId } });
  } catch (error) {
    throw duplicateError(error, "PRODUCT");
  }
}

async function updateProductWithClient(tx:Prisma.TransactionClient,tenant: TenantContext,productId: string,raw: unknown) {
  const data = productInputSchema.parse(raw);
  await validateCategory(tx, tenant.organizationId, data.categoryId);
  try {
    return await (async (tx: Prisma.TransactionClient) => {
      const product = await tx.product.findFirst({ where: { id: productId, organizationId: tenant.organizationId }, select: { trackingMode: true } });
      if (!product) throw new CatalogError("NOT_FOUND", "Товар не найден.");
      if (product.trackingMode !== data.trackingMode && await hasProductOperationalHistory(tx, tenant.organizationId, productId))
        throw new CatalogError("TRACKING_MODE_CONFLICT", "Способ учёта нельзя изменить после появления складской, закупочной или заказной истории.");
      return tx.product.update({ where: { id: productId }, data: { ...data, archivedAt: data.publicationStatus === "ARCHIVED" ? new Date() : null } });
    })(tx);
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw duplicateError(error, "PRODUCT");
  }
}

async function archiveProductWithClient(tx:Prisma.TransactionClient,tenant: TenantContext,productId: string) {
  const result = await tx.product.updateMany({ where: { id: productId, organizationId: tenant.organizationId }, data: { publicationStatus: "ARCHIVED", archivedAt: new Date() } });
  if (!result.count) throw new CatalogError("NOT_FOUND", "Товар не найден.");
}

async function createCategoryWithClient(tx:Prisma.TransactionClient,tenant: TenantContext,raw: unknown) {
  const data = categoryInputSchema.parse(raw);
  await validateCategory(tx, tenant.organizationId, data.parentId);
  return tx.category.create({ data: { ...data, slug: `category-${randomUUID()}`, organizationId: tenant.organizationId } });
}

async function updateCategoryWithClient(tx:Prisma.TransactionClient,tenant: TenantContext,categoryId: string,raw: unknown) {
  const data = categoryInputSchema.parse(raw);
  if (data.parentId === categoryId) throw new CatalogError("VALIDATION", "Категория не может быть собственным родителем.");
  await validateCategory(tx, tenant.organizationId, data.parentId);
  let ancestorId = data.parentId;
  while (ancestorId) {
    if (ancestorId === categoryId) throw new CatalogError("VALIDATION", "Нельзя переместить категорию внутрь её дочерней категории.");
    const ancestor = await tx.category.findFirst({ where: { id: ancestorId, organizationId: tenant.organizationId }, select: { parentId: true } });
    ancestorId = ancestor?.parentId ?? null;
  }
  const result = await tx.category.updateMany({ where: { id: categoryId, organizationId: tenant.organizationId }, data });
  if (!result.count) throw new CatalogError("NOT_FOUND", "Категория не найдена.");
}

async function createSizeWithClient(tx:Prisma.TransactionClient,tenant: TenantContext,raw: unknown) {
  const data = sizeInputSchema.parse(raw);
  try {
    return await tx.size.create({ data: { ...data, organizationId: tenant.organizationId } });
  } catch (error) {
    throw duplicateError(error, "SIZE");
  }
}

async function updateSizeWithClient(tx:Prisma.TransactionClient,tenant: TenantContext,sizeId: string,raw: unknown) {
  const data = sizeInputSchema.parse(raw);
  try {
    const result = await tx.size.updateMany({ where: { id: sizeId, organizationId: tenant.organizationId }, data });
    if (!result.count) throw new CatalogError("NOT_FOUND", "Размер не найден.");
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw duplicateError(error, "SIZE");
  }
}

async function createProductExecutionWithClient(tx:Prisma.TransactionClient,tenant: TenantContext,raw: unknown) {
  const data = executionInputSchema.parse(raw);
  const product = await tx.product.findFirst({ where: { id: data.productId, organizationId: tenant.organizationId }, select: { id: true } });
  if (!product) throw new CatalogError("NOT_FOUND", "Товар не найден.");
  try {
    return await tx.productExecution.create({ data: { ...data, code: normalizeScannableCode(data.code), organizationId: tenant.organizationId } });
  } catch (error) {
    throw duplicateError(error, "VARIANT");
  }
}

async function updateProductExecutionWithClient(tx:Prisma.TransactionClient,tenant: TenantContext,executionId: string,raw: unknown) {
  const data = executionInputSchema.parse(raw);
  const current = await tx.productExecution.findFirst({ where: { id: executionId, organizationId: tenant.organizationId }, select: { productId: true } });
  if (!current) throw new CatalogError("NOT_FOUND", "Исполнение не найдено.");
  if (current.productId !== data.productId) throw new CatalogError("VALIDATION", "Исполнение нельзя перенести к другому товару.");
  try {
    return await tx.productExecution.update({ where: { id: executionId }, data: { code: normalizeScannableCode(data.code), name: data.name, sortOrder: data.sortOrder, isActive: data.isActive, isRentableOverride: data.isRentableOverride, isSellableOverride: data.isSellableOverride, showOnWebsiteOverride: data.showOnWebsiteOverride } });
  } catch (error) {
    throw duplicateError(error, "VARIANT");
  }
}

async function addVariantWithClient(tx:Prisma.TransactionClient,tenant: TenantContext,raw: unknown) {
  const data = variantInputSchema.parse(raw);
  const [product, size, execution] = await Promise.all([
    tx.product.findFirst({ where: { id: data.productId, organizationId: tenant.organizationId }, select: { id: true, internalCode: true } }),
    tx.size.findFirst({ where: { id: data.sizeId, organizationId: tenant.organizationId, isActive: true }, select: { id: true, code: true } }),
    data.executionId ? tx.productExecution.findFirst({ where: { id: data.executionId, organizationId: tenant.organizationId, productId: data.productId, isActive: true }, select: { id: true, code: true } }) : Promise.resolve(null)
  ]);
  if (!product || !size || (data.executionId && !execution)) throw new CatalogError("NOT_FOUND", "Товар, исполнение или размер не найден.");
  const sku = data.sku ? normalizeScannableCode(data.sku) : execution
    ? buildExecutionVariantSku(product.internalCode, execution.code, size.code)
    : buildVariantSku(product.internalCode, size.code);
  try {
    const [barcodeCollision, skuCollision] = await Promise.all([
      tx.productInstance.findFirst({ where: { organizationId: tenant.organizationId, barcode: { equals: sku, mode: "insensitive" } }, select: { id: true } }),
      tx.productVariant.findFirst({ where: { organizationId: tenant.organizationId, sku: { equals: sku, mode: "insensitive" } }, select: { id: true } })
    ]);
    if (barcodeCollision || skuCollision) throw new CatalogError("DUPLICATE_SKU", barcodeCollision ? "SKU совпадает со штрихкодом физического экземпляра." : "SKU уже используется в этой организации.");
    return await tx.productVariant.create({ data: { ...data, sku, organizationId: tenant.organizationId } });
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw duplicateError(error, "VARIANT");
  }
}

async function setVariantActiveWithClient(tx:Prisma.TransactionClient,tenant: TenantContext,variantId: string,isActive: boolean) {
  const result = await tx.productVariant.updateMany({ where: { id: variantId, organizationId: tenant.organizationId }, data: { isActive } });
  if (!result.count) throw new CatalogError("NOT_FOUND", "Вариант не найден.");
}

export async function replaceCurrentPrice(tenant: TenantContext, input: { variantId: string; branchId: string | null; type: "RENTAL" | "SALE"; amountMinor: bigint; currency: string }, actor?: WorkflowActor) {
  if (!["RENTAL","SALE"].includes(input.type) || input.amountMinor < BigInt(0) || !/^[A-Z]{3}$/.test(input.currency)) throw new CatalogError("VALIDATION", "Некорректная цена или валюта.");
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await priceScope(tx, tenant, actor, input.branchId);
    const variant = await tx.productVariant.findFirst({ where: { id: input.variantId, organizationId: tenant.organizationId }, select: { id: true } });
    if (!variant) throw new CatalogError("NOT_FOUND", "Вариант не найден.");
    if (input.branchId) {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: tenant.organizationId }, select: { id: true } });
      if (!branch) throw new CatalogError("NOT_FOUND", "Филиал не найден.");
    }
    const now = new Date();
    await tx.productPrice.updateMany({ where: { organizationId: tenant.organizationId, productVariantId: input.variantId, branchId: input.branchId, type: input.type, validUntil: null }, data: { validUntil: now } });
    const price = await tx.productPrice.create({ data: { organizationId: tenant.organizationId, productVariantId: input.variantId, branchId: input.branchId, type: input.type, amountMinor: input.amountMinor, currency: input.currency, validFrom: now } });
    await appendAuditLog(tx,{organizationId:tenant.organizationId,branchId:input.branchId,actorUserId:actor!.userId,actorMembershipId:actor!.membershipId,action:"CATALOG_PRICE_REPLACED",entityType:"ProductPrice",entityId:price.id,metadata:{amountMinor:input.amountMinor.toString(),currency:input.currency,kind:input.type}});
    return price;
  });
}

export async function setMissingProductPrices(tenant: TenantContext, input: { productId: string; branchId: string | null; type: "RENTAL" | "SALE"; amountMinor: bigint }, actor?: WorkflowActor) {
  if (!['RENTAL', 'SALE'].includes(input.type) || input.amountMinor < BigInt(0)) throw new CatalogError("VALIDATION", "Некорректная цена.");
  return db.$transaction(async tx => {
    await priceScope(tx, tenant, actor, input.branchId);
    // Serialize bulk price updates for this product so a repeated submission remains harmless.
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM products WHERE id=${input.productId}::uuid AND organization_id=${tenant.organizationId}::uuid AND archived_at IS NULL FOR UPDATE`);
    if (!locked.length) throw new CatalogError("NOT_FOUND", "Товар не найден.");
    if (input.branchId && !await tx.branch.findFirst({ where: { id: input.branchId, organizationId: tenant.organizationId, status: "ACTIVE" }, select: { id: true } })) throw new CatalogError("NOT_FOUND", "Филиал не найден.");
    const variants = await tx.productVariant.findMany({ where: { organizationId: tenant.organizationId, productId: input.productId, isActive: true }, select: { id: true } });
    if (variants.length > 200) throw new CatalogError("VALIDATION", "Слишком много вариантов для одной операции.");
    const now = new Date(),ids = variants.map(v => v.id);
    const existing = ids.length ? await tx.productPrice.findMany({ where: { organizationId: tenant.organizationId, productVariantId: { in: ids }, branchId: input.branchId, type: input.type, OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, select: { productVariantId: true } }) : [];
    const priced = new Set(existing.map(p => p.productVariantId));
    const missing = ids.filter(id => !priced.has(id));
    if (missing.length) await tx.productPrice.createMany({ data: missing.map(productVariantId => ({ organizationId: tenant.organizationId, productVariantId, branchId: input.branchId, type: input.type, amountMinor: input.amountMinor, currency: "KZT", validFrom: now })) });
    if(missing.length)await appendAuditLog(tx,{organizationId:tenant.organizationId,branchId:input.branchId,actorUserId:actor!.userId,actorMembershipId:actor!.membershipId,action:"CATALOG_PRICES_FILLED",entityType:"Product",entityId:input.productId,metadata:{itemCount:missing.length,amountMinor:input.amountMinor.toString(),kind:input.type}});
    return missing.length;
  }, { maxWait: 10000, timeout: 30000 });
}

async function priceScope(tx: Prisma.TransactionClient, tenant: TenantContext, actor: WorkflowActor | undefined, branchId: string | null) {
  if(!actor || actor.organizationId!==tenant.organizationId)throw new CatalogError("FORBIDDEN","Недостаточно прав для операции.");
  try { await workflowScope(tx,actor,["CATALOG_EDIT"],branchId??undefined); }
  catch { throw new CatalogError("FORBIDDEN","Недостаточно прав или филиал недоступен."); }
}
export async function createSerializedInstances(tenant: TenantContext, input: {variantId:string;branchId:string;locationId:string;quantity:number;purchaseCostMinor?:bigint;notes?:string|null;idempotencyKey?:string}, actor?: WorkflowActor) {
 if(!actor||actor.organizationId!==tenant.organizationId||!input.idempotencyKey)throw new CatalogError("FORBIDDEN","Обновите форму и проверьте права на операцию.");
 return receiveSerialized(tenant,{...input,idempotencyKey:input.idempotencyKey,comment:input.notes??undefined},actor);
}
export async function adjustBulkStock(tenant:TenantContext,input:{variantId:string;branchId:string;locationId:string|null;delta:number;reason:string;userId?:string;idempotencyKey?:string},actor?:WorkflowActor){
 if(!actor||actor.organizationId!==tenant.organizationId||!input.idempotencyKey)throw new CatalogError("FORBIDDEN","Обновите форму и проверьте права на операцию.");
 if(!input.locationId)throw new CatalogError("VALIDATION","Выберите место хранения.");
 return changeBulk(tenant,{...input,locationId:input.locationId,idempotencyKey:input.idempotencyKey,type:"ADJUSTMENT"},actor);
}

export async function createProduct(tenant: TenantContext,raw: unknown,actor?:AuditActor){return auditedMutation(tenant,actor,"CREATE_PRODUCT","Product",null,tx=>createProductWithClient(tx,tenant,raw));}
export async function updateProduct(tenant: TenantContext,productId: string,raw: unknown,actor?:AuditActor){return auditedMutation(tenant,actor,"UPDATE_PRODUCT","Product",productId,tx=>updateProductWithClient(tx,tenant,productId,raw));}
export async function archiveProduct(tenant: TenantContext,productId: string,actor?:AuditActor){return auditedMutation(tenant,actor,"ARCHIVE_PRODUCT","Product",productId,tx=>archiveProductWithClient(tx,tenant,productId));}
export async function createCategory(tenant: TenantContext,raw: unknown,actor?:AuditActor){return auditedMutation(tenant,actor,"CREATE_CATEGORY","Category",null,tx=>createCategoryWithClient(tx,tenant,raw));}
export async function updateCategory(tenant: TenantContext,categoryId: string,raw: unknown,actor?:AuditActor){return auditedMutation(tenant,actor,"UPDATE_CATEGORY","Category",categoryId,tx=>updateCategoryWithClient(tx,tenant,categoryId,raw));}
export async function createSize(tenant: TenantContext,raw: unknown,actor?:AuditActor){return auditedMutation(tenant,actor,"CREATE_SIZE","Size",null,tx=>createSizeWithClient(tx,tenant,raw));}
export async function updateSize(tenant: TenantContext,sizeId: string,raw: unknown,actor?:AuditActor){return auditedMutation(tenant,actor,"UPDATE_SIZE","Size",sizeId,tx=>updateSizeWithClient(tx,tenant,sizeId,raw));}
export async function createProductExecution(tenant: TenantContext,raw: unknown,actor?:AuditActor){return auditedMutation(tenant,actor,"CREATE_PRODUCT_EXECUTION","ProductExecution",null,tx=>createProductExecutionWithClient(tx,tenant,raw));}
export async function updateProductExecution(tenant: TenantContext,executionId: string,raw: unknown,actor?:AuditActor){return auditedMutation(tenant,actor,"UPDATE_PRODUCT_EXECUTION","ProductExecution",executionId,tx=>updateProductExecutionWithClient(tx,tenant,executionId,raw));}
export async function addVariant(tenant: TenantContext,raw: unknown,actor?:AuditActor){return auditedMutation(tenant,actor,"ADD_VARIANT","ProductVariant",null,tx=>addVariantWithClient(tx,tenant,raw));}
export async function setVariantActive(tenant: TenantContext,variantId: string,isActive: boolean,actor?:AuditActor){return auditedMutation(tenant,actor,"SET_VARIANT_ACTIVE","ProductVariant",variantId,tx=>setVariantActiveWithClient(tx,tenant,variantId,isActive));}
