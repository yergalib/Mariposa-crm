import type { PublicProductDetail } from "@/lib/showroom/contracts";

// Prices are from current public reads; ordinal numbers refer to displayed order.
export function comparedPriceSummary(products: PublicProductDetail[], size: string | null): string | null {
  if (products.length < 2) return null;
  const prices = products.map(p => {
    const options = size ? p.options.filter(o => o.size === size) : p.options;
    return options.length === 1 ? options[0].price : null;
  });
  if (prices.some(p => !p) || prices.some(p => p!.currency !== prices[0]!.currency)) return "Сравнить цены этих вариантов пока нельзя: нужна подтверждённая цена в одной валюте для каждого варианта.";
  const values = prices.map(p => BigInt(p!.amountMinor));
  const minimum = values.reduce((a, b) => a < b ? a : b);
  const positions = values.flatMap((v, i) => v === minimum ? [i + 1] : []);
  return positions.length === values.length ? "У сравниваемых вариантов одинаковая подтверждённая цена." : `Среди этих вариантов меньшая подтверждённая цена у варианта${positions.length > 1 ? "ов" : ""} №${positions.join(", №")}. Это сравнение выбранных товаров, не всего каталога.`;
}
