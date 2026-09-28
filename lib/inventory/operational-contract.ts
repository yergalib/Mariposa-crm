export type ScanPurpose = "CATALOG_LOOKUP" | "ORDER_ITEM_SELECT" | "FULFILLMENT_ISSUE" | "RETURN_RECEIVE" | "STOCKTAKE_COUNT" | "WAREHOUSE_LOOKUP";
export type SafeProduct = { id: string; name: string; code: string };
export type SafeExecution = { id: string; name: string } | null;
export type SafeSize = { code: string; name: string; sizeSystem: string; recommendedHeightCm: number | null; lengthCm: number | null };
export type OperationalIdentifierResult =
  | { kind: "BULK_VARIANT"; normalizedIdentifier: string; product: SafeProduct; execution: SafeExecution; variant: { id: string; sku: string; size: SafeSize } }
  | { kind: "SERIALIZED_INSTANCE"; normalizedIdentifier: string; product: SafeProduct; execution: SafeExecution; variant: { id: string; sku: string; size: SafeSize }; instance: { id: string; barcode: string; inventoryNumber: string; operationalStatus: string; conditionStatus: string; branchId: string; locationId: string } }
  | { kind: "PRODUCT_NEEDS_VARIANT_SELECTION"; normalizedIdentifier: string; product: SafeProduct; trackingMode: "BULK" | "SERIALIZED"; variants: Array<{ id: string; sku: string; execution: SafeExecution; size: SafeSize }> }
  | { kind: "NOT_FOUND"; normalizedIdentifier: string; reason?: "BRANCH_MISMATCH" }
  | { kind: "NOT_AVAILABLE"; normalizedIdentifier: string }
  | { kind: "AMBIGUOUS_IDENTIFIER"; normalizedIdentifier: string };

export type OperationalSearchHit = {
  product: SafeProduct;
  trackingMode: "BULK" | "SERIALIZED";
  variant: { id: string; sku: string; execution: SafeExecution; size: SafeSize } | null;
};

export type OperationalActionResult =
  | { ok: true; result: OperationalIdentifierResult }
  | { ok: false; error: "UNAUTHORIZED" | "FORBIDDEN" | "INVALID_INPUT" | "SERVER_ERROR"; message: string };

export type ReturnOperationalContext =
  | { kind: "RETURN_SERIALIZED"; eligible: true; order: { id: string; orderNumber: string; customerName: string; branchName: string; rentalEndAt: string | null }; overdue: boolean }
  | { kind: "RETURN_BULK"; eligible: boolean; orders: Array<{ allocationId: string; orderId: string; orderNumber: string; customerName: string; branchName: string; rentalEndAt: string | null; outstanding: number }> }
  | { kind: "RETURN_NOT_ELIGIBLE"; eligible: false; message: string };

export type WarehouseOperationalContext =
  | { kind: "WAREHOUSE_BULK"; levels: Array<{ branchId: string; branchName: string; locationId: string | null; locationName: string; quantity: number }> }
  | { kind: "WAREHOUSE_SERIALIZED"; branchName: string; locationName: string; operationalStatus: string; conditionStatus: string };

export type OperationalContext = ReturnOperationalContext | WarehouseOperationalContext;
export type OperationalContextActionResult =
  | { ok: true; result: OperationalIdentifierResult; context: OperationalContext | null }
  | { ok: false; error: "UNAUTHORIZED" | "FORBIDDEN" | "INVALID_INPUT" | "SERVER_ERROR"; message: string };

