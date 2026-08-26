export type CatalogErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "DUPLICATE_INTERNAL_CODE"
  | "DUPLICATE_SKU"
  | "DUPLICATE_SIZE"
  | "TRACKING_MODE_CONFLICT"
  | "NEGATIVE_STOCK"
  | "UNSUPPORTED_IMAGE"
  | "IMAGE_TOO_LARGE"
  | "STORAGE_UNAVAILABLE";

export class CatalogError extends Error {
  constructor(readonly code: CatalogErrorCode, message: string) {
    super(message);
    this.name = "CatalogError";
  }
}
