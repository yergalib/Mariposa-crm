/** Display metadata only: never change size identity, variant ID or stored SKU. */
export type CatalogSize = { name: string; code: string; sizeSystem: string; recommendedHeightCm: number | null };
const natural = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });
export function catalogSizeLabel(size: CatalogSize): string {
  if (size.sizeSystem === "HEIGHT_CM" && /^\d+(?:[.,]\d+)?$/.test(size.code)) return `Рост ${size.code} см`;
  if (size.sizeSystem === "MANUFACTURER_SIZE" && size.recommendedHeightCm !== null)
    return `Размер ${size.code} · рост ${size.recommendedHeightCm} см`;
  return size.name || size.code;
}
export function compareCatalogSizes(a: CatalogSize, b: CatalogSize): number {
  return natural.compare(a.sizeSystem, b.sizeSystem) || natural.compare(a.code, b.code) || natural.compare(a.name, b.name);
}
/** Preserve round trips when a displayed label is saved in selection/filter state. */
export function catalogSizeWhere(value: string) {
  const height = /^Рост (\d+(?:[.,]\d+)?) см$/iu.exec(value);
  if (height) return { sizeSystem: "HEIGHT_CM" as const, code: { equals: height[1], mode: "insensitive" as const } };
  const manufacturer = /^Размер (.+) · рост (\d+) см$/iu.exec(value);
  if (manufacturer) return { sizeSystem: "MANUFACTURER_SIZE" as const, code: { equals: manufacturer[1], mode: "insensitive" as const }, recommendedHeightCm: Number(manufacturer[2]) };
  return { OR: [{ name: { equals: value, mode: "insensitive" as const } }, { code: { equals: value, mode: "insensitive" as const } }] };
}
