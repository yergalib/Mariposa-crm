export function discountPreview(gross: string, itemDiscount: string, orderDiscount: string) {
  if (![gross, itemDiscount, orderDiscount].every(value => /^\d{1,30}$/.test(value))) return null;
  const before = BigInt(gross), items = BigInt(itemDiscount), order = BigInt(orderDiscount);
  const after = before - items - order;
  return { before, items, order, after, valid: after >= BigInt(0) };
}
export function discountHistory(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (typeof value.discountBefore !== "string" || typeof value.discountAfter !== "string" || !/^\d{1,30}$/.test(value.discountBefore) || !/^\d{1,30}$/.test(value.discountAfter)) return null;
  return { before: value.discountBefore, after: value.discountAfter, reason: typeof value.adjustmentReason === "string" ? value.adjustmentReason.slice(0, 4000) : null };
}
