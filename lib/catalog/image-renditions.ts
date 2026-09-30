import sharp from "sharp";

// These are upper bounds, not crops: the whole product stays visible at every size.
export const PRODUCT_IMAGE_RENDITIONS = {
  catalog: { width: 480, height: 480, format: "webp", contentType: "image/webp" },
  site: { width: 1600, height: 1600, format: "webp", contentType: "image/webp" },
  messaging: { width: 1280, height: 1280, format: "jpeg", contentType: "image/jpeg" }
} as const;

export type ProductImageRendition = keyof typeof PRODUCT_IMAGE_RENDITIONS;

export function renditionStorageKey(sourceKey: string, rendition: ProductImageRendition) {
  const extension = PRODUCT_IMAGE_RENDITIONS[rendition].format === "jpeg" ? "jpg" : "webp";
  return `${sourceKey}.${rendition}.${extension}`;
}

export function renditionStorageKeys(sourceKey: string) {
  return (Object.keys(PRODUCT_IMAGE_RENDITIONS) as ProductImageRendition[]).map((rendition) => renditionStorageKey(sourceKey, rendition));
}

export async function renderProductImageRenditions(bytes: Uint8Array) {
  return Promise.all((Object.keys(PRODUCT_IMAGE_RENDITIONS) as ProductImageRendition[]).map(async (rendition) => {
    const preset = PRODUCT_IMAGE_RENDITIONS[rendition];
    const pipeline = sharp(bytes).rotate().resize(preset.width, preset.height, { fit: "inside", withoutEnlargement: true });
    const data = preset.format === "jpeg"
      ? await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer()
      : await pipeline.webp({ quality: 82 }).toBuffer();
    return { rendition, data, contentType: preset.contentType, width: preset.width, height: preset.height };
  }));
}
