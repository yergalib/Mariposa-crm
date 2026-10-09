import { hasSensitiveText } from "./contracts";
import { outfitContextSchema, type OutfitContext } from "./outfit-contracts";

// Preferences only. No price, availability, contact, transcript or saved-record claim.
export function handoffPreferences(raw?: OutfitContext): string {
  const parsed = outfitContextSchema.safeParse(raw);
  if (!parsed.success) return "Пожелания ещё не указаны.";
  const context = parsed.data;
  const lines: string[] = [];
  if (context.from || context.until) lines.push(`Получение: ${context.from ?? "уточнить"}; возврат: ${context.until ?? "уточнить"}. Время выбранного филиала.`);
  if (context.heightCm) lines.push(`Рост: ${context.heightCm} см — ориентир, не подтверждённый размер или посадка.`);
  const labels = { dress: "Платье", shoes: "Обувь", accessory: "Аксессуар" };
  for (const slot of ["dress", "shoes", "accessory"] as const) {
    const criteria = context.criteria[slot];
    const safe = (value: string | null) => value && !hasSensitiveText(value) ? value : null;
    const size = safe(criteria.size), color = safe(criteria.color);
    if (size || color || (slot === "dress" && criteria.color === "")) lines.push(`${labels[slot]}: размер ${size ?? "уточнить"}, цвет ${color ?? (criteria.color === "" ? "любой" : "уточнить")}.`);
  }
  return lines.join("\n") || "Пожелания ещё не указаны.";
}
