import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { variantOperationWhere } from "@/lib/catalog/operation-policy";
import { getStorageClient, PRODUCT_IMAGES_BUCKET } from "@/lib/storage/client";
import { renditionStorageKey } from "@/lib/catalog/image-renditions";
import type { PublicPhoto } from "./contracts";

const scopeInput = z.object({ productId: z.string().uuid(), executionId: z.string().uuid().nullable() });
function where(organizationId: string, productId: string, executionId: string | null) {
  return { organizationId, productId, executionId, productVariantId: null, status: "ACTIVE" as const, deletedAt: null,
    mimeType: { in: ["image/jpeg", "image/png", "image/webp"] },
    product: { organizationId, variants: { some: { AND: [variantOperationWhere(organizationId, "RENTAL", true), { executionId }] } } } };
}
export async function publicPhotos(organizationId: string, group: { productId: string; executionId: string | null; name: string }): Promise<PublicPhoto[]> {
  const { productId, executionId } = scopeInput.parse(group);
  const rows = await db.productImage.findMany({ where: where(organizationId, productId, executionId),
    select: { id: true, width: true, height: true }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }], take: 8 });
  return rows.map((row, index) => ({ id: row.id, src: "/api/showroom/photo?" + new URLSearchParams({ productId, executionId: executionId ?? "", imageId: row.id }),
    alt: `${group.name} — фото ${index + 1}`, width: row.width ?? 1600, height: row.height ?? 1600 }));
}
export async function withPublicPhotos<T extends { productId: string; executionId: string | null; name: string }>(organizationId: string, groups: T[]): Promise<(T & { images: PublicPhoto[] })[]> {
  const result: (T & { images: PublicPhoto[] })[] = [];
  for (let offset = 0; offset < groups.length; offset += 2) result.push(...await Promise.all(groups.slice(offset, offset + 2).map(async group => ({ ...group, images: await publicPhotos(organizationId, group) }))));
  return result;
}
export async function readPublicPhoto(organizationId: string, raw: unknown): Promise<Blob | null> {
  const input = scopeInput.extend({ imageId: z.string().uuid() }).strict().parse(raw);
  const branch = await db.branch.findFirst({ where: { organizationId, isPublic: true, status: "ACTIVE", organization: { status: "ACTIVE" } }, select: { id: true } });
  if (!branch) return null;
  const row = await db.productImage.findFirst({ where: { ...where(organizationId, input.productId, input.executionId), id: input.imageId }, select: { storageKey: true } });
  if (!row || !row.storageKey.startsWith(`organizations/${organizationId}/products/${input.productId}/`) || row.storageKey.includes("..")) return null;
  const client = getStorageClient(); if (!client) return null;
  // Existing CRM-generated rendition strips metadata. Never fall back to private originals.
  const { data, error } = await client.storage.from(PRODUCT_IMAGES_BUCKET).download(renditionStorageKey(row.storageKey, "site"));
  if (error || !data || data.size > 8 * 1024 * 1024) return null;
  const signature = new Uint8Array(await data.slice(0, 12).arrayBuffer());
  if (String.fromCharCode(...signature.slice(0, 4)) !== "RIFF" || String.fromCharCode(...signature.slice(8, 12)) !== "WEBP") return null;
  return data;
}
