import type { ChatCard } from "./contracts";

// CRM DTOs only: integer minor units, no currency conversion or global-price claim.
export function cheaperAlternatives(cards: ChatCard[], reference: ChatCard): ChatCard[] {
  const price = reference.item.price;
  if (!price) return [];
  return cards.filter(card => card.item.id !== reference.item.id && card.item.available
    && card.item.price?.currency === price.currency && BigInt(card.item.price.amountMinor) < BigInt(price.amountMinor))
    .sort((a, b) => {
      const left = BigInt(a.item.price!.amountMinor), right = BigInt(b.item.price!.amountMinor);
      return left < right ? -1 : left > right ? 1 : 0;
    });
}
