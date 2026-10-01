export function revenueFamily(row: { kind: string; sourceType: string; sourceId: string | null; orderId: string | null; order: null | { type: string }; reversalOf: null | { kind: string; sourceType: string; sourceId: string | null; orderId: string | null; order: null | { type: string } } }) {
  const root = row.kind === "REVERSAL" ? row.reversalOf : row;
  if (!root) return "AMBIGUOUS" as const;
  if ((root.kind === "RENTAL_CHARGE" || root.kind === "SALE_CHARGE" || root.kind === "DISCOUNT") && root.sourceType === "ORDER_CHARGE" && root.sourceId === root.orderId) {
    if (root.order?.type === "RENTAL" && root.kind !== "SALE_CHARGE") return "RENTAL" as const;
    if (root.order?.type === "SALE" && root.kind !== "RENTAL_CHARGE") return "SALE" as const;
    return "AMBIGUOUS" as const;
  }
  if (root.kind === "DAMAGE_CHARGE" && root.sourceType === "RETURN_DAMAGE_ASSESSMENT") return "DAMAGE" as const;
  if (root.kind === "SALE_CHARGE") return "AMBIGUOUS" as const;
  return row.kind === "REVERSAL" || root.kind === "DISCOUNT" || root.kind.endsWith("CHARGE") ? "AMBIGUOUS" as const : "OTHER" as const;
}

