export type PhotoImportRow = {
  sourceFileId: string;
  sourceName: string;
  productId: string;
  productName: string;
  executionId: string | null;
  executionName: string | null;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
};

type SourcePhoto = { id: string; name: string; mime: string; size: number };
type SourceFolder = {
  source: string;
  legacyCode: string;
  status: string;
  productId: string | null;
  productName: string | null;
  executionId: string | null;
  executionName: string | null;
  photos: SourcePhoto[];
};
type Manifest = { organizationId: string; folders: SourceFolder[] };

export function planCatalogPhotoImport(manifest: Manifest, source = "фото для сайта 2") {
  if (!manifest.organizationId || !Array.isArray(manifest.folders)) throw new Error("Invalid photo manifest.");
  const rows: PhotoImportRow[] = [];
  const excluded: Array<{ code: string; reason: string; photos: number }> = [];
  const seen = new Set<string>();
  for (const folder of manifest.folders.filter((item) => item.source === source)) {
    if (!folder.productId || !folder.productName || folder.status === "NO_PRODUCT") {
      excluded.push({ code: folder.legacyCode, reason: "NO_PRODUCT", photos: folder.photos.length });
      continue;
    }
    if (folder.status === "REVIEW") {
      excluded.push({ code: folder.legacyCode, reason: "REVIEW_EXECUTION", photos: folder.photos.length });
      continue;
    }
    for (const photo of folder.photos) {
      if (!/^[A-Za-z0-9_-]{10,128}$/.test(photo.id)) throw new Error(`Invalid source file ID for ${folder.legacyCode}.`);
      if (photo.mime !== "image/jpeg" && photo.mime !== "image/png" && photo.mime !== "image/webp") {
        excluded.push({ code: folder.legacyCode, reason: "UNSUPPORTED_IMAGE", photos: 1 });
        continue;
      }
      if (!Number.isFinite(photo.size) || photo.size < 1 || photo.size > 8 * 1024 * 1024) {
        excluded.push({ code: folder.legacyCode, reason: "INVALID_SIZE", photos: 1 });
        continue;
      }
      const key = `${folder.productId}:${photo.id}`;
      if (seen.has(key)) throw new Error(`Duplicate source file ${photo.id} for ${folder.productId}.`);
      seen.add(key);
      rows.push({ sourceFileId: photo.id, sourceName: photo.name, productId: folder.productId, productName: folder.productName, executionId: folder.executionId, executionName: folder.executionName, mimeType: photo.mime, size: photo.size });
    }
  }
  return { organizationId: manifest.organizationId, source, rows, excluded };
}
