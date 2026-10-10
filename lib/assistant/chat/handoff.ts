import type { ChatCard } from "./contracts";
import { selectedProductReference } from "./storage";
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
  for (const note of context.notes ?? []) if (!hasSensitiveText(note) && lines.join("\n").length + note.length < 650) lines.push("Пожелание: " + note);
  return lines.join("\n") || "Пожелания ещё не указаны.";
}

// Persist identifiers from tool-backed cards only, never their name, price or availability.
// Restored identifiers remain untrusted hints; existing public tools revalidate before handoff.
export function selectedProductReferences(context: OutfitContext | undefined, outfit: Partial<Record<import("./outfit-contracts").OutfitSlot, ChatCard>> = {}, previous: unknown[] = []) {
  return (["dress", "shoes", "accessory"] as const).flatMap(slot => {
    const card = outfit[slot];
    if (!card) return previous.flatMap(raw => {
      const ref = selectedProductReference.safeParse(raw);
      return ref.success && ref.data.slot === slot && context?.selected[slot] === ref.data.variantId ? [ref.data] : [];
    }).slice(0, 1);
    if (context?.selected[slot] !== card.item.id) return [];
    const parsed = selectedProductReference.safeParse({ slot, productId: card.productId, executionId: card.executionId, variantId: card.item.id });
    return parsed.success ? [parsed.data] : [];
  });
}
