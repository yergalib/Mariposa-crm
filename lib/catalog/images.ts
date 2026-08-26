import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { CatalogError } from "@/lib/catalog/errors";
import { getStorageClient, PRODUCT_IMAGES_BUCKET } from "@/lib/storage/client";
import type { TenantContext } from "@/lib/tenant/context";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

function imageDimensions(bytes: Uint8Array, mimeType: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === "image/png" && bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mimeType === "image/webp" && bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...bytes.slice(12, 16));
    if (kind === "VP8X") return { width: 1 + view.getUint8(24) + (view.getUint8(25) << 8) + (view.getUint8(26) << 16), height: 1 + view.getUint8(27) + (view.getUint8(28) << 8) + (view.getUint8(29) << 16) };
    if (kind === "VP8L" && bytes.length >= 25 && view.getUint8(20) === 0x2f) { const bits=view.getUint32(21,true); return { width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1 }; }
    if (kind === "VP8 " && bytes.length >= 30 && view.getUint8(23) === 0x9d && view.getUint8(24) === 0x01 && view.getUint8(25) === 0x2a) return { width:view.getUint16(26,true)&0x3fff,height:view.getUint16(28,true)&0x3fff };
  }
  if (mimeType === "image/jpeg" && bytes.length >= 4 && view.getUint16(0) === 0xffd8) {
    let offset=2;
    while(offset+9<bytes.length){ if(view.getUint8(offset)!==0xff){offset++;continue;} const marker=view.getUint8(offset+1); if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return {height:view.getUint16(offset+5),width:view.getUint16(offset+7)}; if(marker===0xd9||marker===0xda)break; const length=view.getUint16(offset+2); if(length<2)break; offset+=2+length; }
  }
  throw new CatalogError("UNSUPPORTED_IMAGE", "Файл не является корректным поддерживаемым изображением.");
}

async function ensureBucket() {
  const client = getStorageClient();
  if (!client) throw new CatalogError("STORAGE_UNAVAILABLE", "Хранилище фотографий не настроено.");
  const { data } = await client.storage.getBucket(PRODUCT_IMAGES_BUCKET);
  if (!data) {
    const { error } = await client.storage.createBucket(PRODUCT_IMAGES_BUCKET, {
      public: false,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: [...ALLOWED_IMAGES.keys()]
    });
    if (error && !/already exists/i.test(error.message)) {
      throw new CatalogError("STORAGE_UNAVAILABLE", "Не удалось подготовить хранилище фотографий.");
    }
  }
  return client;
}

export async function getSignedProductImageUrl(storageKey: string) {
  const client = getStorageClient();
  if (!client) return null;
  const { data, error } = await client.storage.from(PRODUCT_IMAGES_BUCKET).createSignedUrl(storageKey, 3600);
  return error ? null : data.signedUrl;
}

export async function uploadProductImage(tenant: TenantContext, input: { productId: string; file: File; altText?: string | null }) {
  const extension = ALLOWED_IMAGES.get(input.file.type);
  if (!extension) {
    const message = /hei[cf]/i.test(input.file.type)
      ? "HEIC/HEIF пока не поддерживается. На iPhone выберите «Наиболее совместимый» формат или загрузите JPEG."
      : "Поддерживаются только JPEG, PNG и WebP.";
    throw new CatalogError("UNSUPPORTED_IMAGE", message);
  }
  if (input.file.size <= 0 || input.file.size > MAX_IMAGE_BYTES) {
    throw new CatalogError("IMAGE_TOO_LARGE", "Размер фотографии должен быть не больше 8 МБ.");
  }
  const product = await db.product.findFirst({ where: { id: input.productId, organizationId: tenant.organizationId }, select: { id: true } });
  if (!product) throw new CatalogError("NOT_FOUND", "Товар не найден.");
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const dimensions = imageDimensions(bytes, input.file.type);
  if (dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 20000 || dimensions.height > 20000) throw new CatalogError("UNSUPPORTED_IMAGE", "Некорректные размеры изображения.");
  const storageKey = `organizations/${tenant.organizationId}/products/${product.id}/${randomUUID()}.${extension}`;
  const client = await ensureBucket();
  const { error: uploadError } = await client.storage.from(PRODUCT_IMAGES_BUCKET).upload(storageKey, bytes, { contentType: input.file.type, upsert: false, cacheControl: "3600" });
  if (uploadError) throw new CatalogError("STORAGE_UNAVAILABLE", "Не удалось загрузить фотографию.");

  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenant.organizationId}:${product.id}:images`}, 0))`;
      const aggregate = await tx.productImage.aggregate({ where: { organizationId: tenant.organizationId, productId: product.id, status: "ACTIVE" }, _max: { sortOrder: true }, _count: true });
      return tx.productImage.create({
        data: {
          organizationId: tenant.organizationId,
          productId: product.id,
          storageKey,
          mimeType: input.file.type,
          width: dimensions.width,
          height: dimensions.height,
          sortOrder: (aggregate._max.sortOrder ?? -1) + 1,
          isPrimary: aggregate._count === 0,
          altText: input.altText?.trim().slice(0, 240) || null
        }
      });
    });
  } catch (error) {
    await client.storage.from(PRODUCT_IMAGES_BUCKET).remove([storageKey]);
    throw error;
  }
}

export async function setPrimaryProductImage(tenant: TenantContext, imageId: string) {
  return db.$transaction(async (tx) => {
    const image = await tx.productImage.findFirst({ where: { id: imageId, organizationId: tenant.organizationId, status: "ACTIVE" }, select: { id: true, productId: true } });
    if (!image) throw new CatalogError("NOT_FOUND", "Фотография не найдена.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenant.organizationId}:${image.productId}:images`}, 0))`;
    await tx.productImage.updateMany({ where: { organizationId: tenant.organizationId, productId: image.productId, status: "ACTIVE", isPrimary: true }, data: { isPrimary: false } });
    return tx.productImage.update({ where: { id: image.id }, data: { isPrimary: true } });
  });
}

export async function reorderProductImages(tenant: TenantContext, productId: string, imageIds: string[]) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenant.organizationId}:${productId}:images`}, 0))`;
    const images = await tx.productImage.findMany({ where: { organizationId: tenant.organizationId, productId, status: "ACTIVE", id: { in: imageIds } }, select: { id: true } });
    if (images.length !== imageIds.length || new Set(imageIds).size !== imageIds.length) throw new CatalogError("NOT_FOUND", "Некоторые фотографии не найдены.");
    await Promise.all(imageIds.map((id, sortOrder) => tx.productImage.update({ where: { id }, data: { sortOrder } })));
  });
}

export async function deleteProductImage(tenant: TenantContext, imageId: string) {
  const client = getStorageClient();
  if (!client) throw new CatalogError("STORAGE_UNAVAILABLE", "Хранилище фотографий не настроено.");
  const snapshot = await db.$transaction(async (tx) => {
    const image = await tx.productImage.findFirst({ where: { id: imageId, organizationId: tenant.organizationId, status: "ACTIVE" }, select: { id: true, productId: true, storageKey: true, isPrimary: true } });
    if (!image) throw new CatalogError("NOT_FOUND", "Фотография не найдена.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenant.organizationId}:${image.productId}:images`}, 0))`;
    await tx.productImage.update({ where: { id: image.id }, data: { status: "DELETED", deletedAt: new Date(), isPrimary: false } });
    let replacementId: string | null = null;
    if (image.isPrimary) {
      const next = await tx.productImage.findFirst({ where: { organizationId: tenant.organizationId, productId: image.productId, status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
      if (next) {
        replacementId = next.id;
        await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
    }
    return { ...image, replacementId };
  });
  const { error } = await client.storage.from(PRODUCT_IMAGES_BUCKET).remove([snapshot.storageKey]);
  if (error) {
    await db.$transaction(async (tx) => {
      if (snapshot.replacementId) await tx.productImage.updateMany({ where: { id: snapshot.replacementId, organizationId: tenant.organizationId }, data: { isPrimary: false } });
      await tx.productImage.updateMany({ where: { id: snapshot.id, organizationId: tenant.organizationId }, data: { status: "ACTIVE", deletedAt: null, isPrimary: snapshot.isPrimary } });
    });
    throw new CatalogError("STORAGE_UNAVAILABLE", "Не удалось удалить файл; изменение отменено.");
  }
}
