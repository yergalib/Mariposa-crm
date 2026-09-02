export class InventoryError extends Error {
  constructor(public code: "NOT_FOUND"|"INVALID"|"INSUFFICIENT_STOCK"|"BLOCKED"|"FORBIDDEN", message: string) { super(message); }
}
