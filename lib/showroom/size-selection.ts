type SizeOption = { id: string; size: string; sizeCode?: string };
// Match recorded size labels/codes only; do not infer fit, age or equivalent ranges.
export function uniqueSizeVariant(options: SizeOption[], requested: string): string {
  const key = requested.trim().toLocaleLowerCase();
  if (!key) return "";
  const matches = options.filter(option => [option.size, option.sizeCode].some(value => value?.trim().toLocaleLowerCase() === key));
  return matches.length === 1 ? matches[0].id : "";
}
