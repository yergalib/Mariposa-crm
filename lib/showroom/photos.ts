import { cachedPublicRendition, PublicMediaError } from "./media";
import "server-only";
import { timed, photoOutcome } from "./request-timing";
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
  return rows.map((row, index) => responsivePhoto({ id: row.id, src: "/api/showroom/photo?" + new URLSearchParams({ productId, executionId: executionId ?? "", imageId: row.id }),
    alt: `${group.name} — фото ${index + 1}`, width: row.width ?? 1600, height: row.height ?? 1600 }));
}
export async function withPublicPhotos<T extends { productId: string; executionId: string | null; name: string }>(organizationId: string, groups: T[]): Promise<(T & { images: PublicPhoto[] })[]> {
  // Browse cards render one thumbnail. Keep full galleries on publicProduct only.
  const photos = await representativePublicPhotos(organizationId, groups);
  return groups.map(group => { const photo = photos.get(group.productId + ':' + (group.executionId ?? 'default')); return { ...group, images: photo ? [photo] : [] }; });
}
// Metadata only, same publication/execution restrictions as publicPhotos. One query
// per bounded batch, rather than one photo query for every catalogue group.
export async function representativePublicPhotos(organizationId: string, groups: { productId: string; executionId: string | null; name: string }[]) {
  const result = new Map<string, PublicPhoto>();
  for (let offset = 0; offset < groups.length; offset += 50) {
    const batch = groups.slice(offset, offset + 50);
    const rows = await db.productImage.findMany({
      where: { OR: batch.map(group => where(organizationId, group.productId, group.executionId)) },
      distinct: ["productId", "executionId"],
      select: { id: true, productId: true, executionId: true, width: true, height: true },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }]
    });
    for (const row of rows) {
      const group = batch.find(group => group.productId === row.productId && group.executionId === row.executionId);
      if (!group) continue;
      result.set(row.productId + ":" + (row.executionId ?? "default"), responsivePhoto({
        id: row.id, src: "/api/showroom/photo?" + new URLSearchParams({ productId: row.productId, executionId: row.executionId ?? "", imageId: row.id }),
        alt: `${group.name} — фото 1`, width: row.width ?? 1600, height: row.height ?? 1600
      }));
    }
  }
  return result;
}
export async function readPublicPhoto(organizationId: string, raw: unknown): Promise<Blob | null> {
  const input = scopeInput.extend({ imageId: z.string().uuid(), rendition:z.enum(["catalog","site"]).default("site") }).strict().parse(raw);
  const branch = await db.branch.findFirst({ where: { organizationId, isPublic: true, status: "ACTIVE", organization: { status: "ACTIVE" } }, select: { id: true } });
  if (!branch) return null;
  const row = await db.productImage.findFirst({ where: { ...where(organizationId, input.productId, input.executionId), id: input.imageId }, select: { storageKey: true } });
  if (!row || !row.storageKey.startsWith(`organizations/${organizationId}/products/${input.productId}/`) || row.storageKey.includes("..")) return null;
  const client = getStorageClient(); if (!client) throw new PublicMediaError(503);
  // Existing CRM-generated rendition strips metadata. Never fall back to private originals.
  const key=renditionStorageKey(row.storageKey,input.rendition);
  return cachedPublicRendition(organizationId+':'+key,async()=>{
  const { data, error } = await timed("storage", () => client.storage.from(PRODUCT_IMAGES_BUCKET).download(key));
  if(error){const status=Number((error as {statusCode?:string;status?:number}).statusCode??(error as {status?:number}).status);photoOutcome(status===404?"missing":"storage_error");throw new PublicMediaError(status===404?404:503)}
  if(!data){photoOutcome("storage_empty");throw new PublicMediaError(503);}
  if(data.size>8*1024*1024)throw new PublicMediaError(502);
  const signature = new Uint8Array(await data.slice(0, 12).arrayBuffer());
  if (String.fromCharCode(...signature.slice(0, 4)) !== "RIFF" || String.fromCharCode(...signature.slice(8, 12)) !== "WEBP") throw new PublicMediaError(502);
  photoOutcome("ok");return data;
  });
}

function responsivePhoto(photo:PublicPhoto):PublicPhoto {
  const width=(bound:number)=>Math.max(1,Math.round(photo.width*Math.min(1,bound/photo.width,bound/photo.height)));
  const small=width(480),large=width(1600);
  return {...photo,srcSet:photo.src+'&rendition=catalog '+small+'w'+(large>small?', '+photo.src+'&rendition=site '+large+'w':'')};
}
