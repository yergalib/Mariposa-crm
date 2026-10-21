import { confirmedCatalogDescriptor, confirmedColorMatches, normalizeCatalogColor } from "@/lib/assistant/colors";
export const colorGroups = [
  { id: "white", label: "Белые", swatch: "#f5f3ee" },
  { id: "pink", label: "Розовые", swatch: "#e6bdcb" },
  { id: "black", label: "Чёрные", swatch: "#333333" },
  { id: "champagne-beige", label: "Шампань / бежевые", swatch: "#ddcdb4" },
  { id: "yellow", label: "Жёлтые", swatch: "#edda86" },
  { id: "red", label: "Красные", swatch: "#ad474c" },
  { id: "blue", label: "Синие / голубые", swatch: "#8faec9" },
  { id: "purple", label: "Фиолетовые", swatch: "#aa94bd" },
  { id: "green", label: "Зелёные", swatch: "#8ca18b" },
  { id: "other", label: "Другие цвета", swatch: "#dfdcd7" },
] as const;
export type ColorGroup = typeof colorGroups[number]["id"];
export const colorGroupIds = ["white", "pink", "black", "champagne-beige", "yellow", "red", "blue", "purple", "green", "other"] as const;
const membership: Record<string, ColorGroup> = { "Белый": "white", "Розовый": "pink", "Чёрный": "black", "Шампань": "champagne-beige", "Бежевый": "champagne-beige", "Красный": "red", "Синий": "blue", "Голубой": "blue", "Фиолетовый": "purple", "Зелёный": "green" };
// Execution overrides model colour. Unknown/mixed execution names never inherit a guessed colour.
export function resolveCatalogColor(execution: string | null, productColor: string | null) {
  const raw = execution?.trim() || productColor?.trim() || "";
  const approved = confirmedCatalogDescriptor(raw);
  if (approved) return {
    group: membership[approved.color] ?? "other", confirmed: true,
    label: "Цвет: " + (approved.color === "Серебристый" ? raw : approved.color.toLowerCase())
      + (approved.detail ? " · " + approved.detail : ""),
  };
  if (!raw) return { group: "other" as ColorGroup, confirmed: false, label: "Цвет не указан" };
  if (/^разноцветный$/iu.test(raw))
    return { group: "other" as ColorGroup, confirmed: true, label: "Цвет: " + raw };
  if (execution?.trim() && /^по\s+\d+(?:[ .]\d{3})*$/iu.test(raw))
    return { group: "other" as ColorGroup, confirmed: false, label: "Исполнение: " + raw };
  if (/^розовый\s*\+\s*жемчуг$/iu.test(raw))
    return { group: "pink" as ColorGroup, confirmed: true, label: "Цвет: " + raw.split("+")[0].trim() + " · Отделка: " + raw.split("+")[1].trim() };
  try {
    const color = normalizeCatalogColor(raw);
    if (color === "Жёлтый") return { group: "yellow" as ColorGroup, confirmed: true, label: "Цвет: " + raw };
    if (color) return { group: membership[color] ?? "other", confirmed: true, label: "Цвет: " + raw };
  } catch { /* Preserve the original descriptor; do not infer a dominant colour. */ }
  return { group: "other" as ColorGroup, confirmed: false, label: "Цвет не подтверждён · " + raw };
}
// Keep the old champagne/beige URL group and add the approved one-way match.
export function catalogColorGroupMatches(group: ColorGroup, execution: string | null, productColor: string | null) {
  const resolved = resolveCatalogColor(execution, productColor);
  return group === "yellow"
    ? resolved.confirmed && confirmedColorMatches("Жёлтый", execution, productColor)
    : resolved.group === group;
}
