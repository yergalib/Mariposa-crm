/** Compact display only; callers retain the full reference in linked details. */
export function compactReference(value: string): string {
  return value.length > 24 ? value.slice(0, 8) + "…" + value.slice(-6) : value;
}
