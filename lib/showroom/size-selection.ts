// Only normalize an explicit size label, never infer the nearest size from height.
export function normalizeSizeLabel(value: string) { return value.trim().replace(/^(\d{2,3})\s*(?:см|cm)\.?$/iu,'$1').toLocaleLowerCase(); }
type SizeOption = { id: string; size: string; sizeCode?: string };
// Match recorded size labels/codes only; do not infer fit, age or equivalent ranges.
export function uniqueSizeVariant(options: SizeOption[], requested: string): string {
  const key = normalizeSizeLabel(requested);
  if (!key) return "";
  const matches = options.filter(option => [option.size, option.sizeCode].some(value => value !== undefined && normalizeSizeLabel(value) === key));
  return matches.length === 1 ? matches[0].id : "";
}
