import type { PublicBrowseCard, PublicVariant } from "./contracts";
type PriceRow = { amountMinor: bigint; currency: string; branchId: string | null };
// Rows are already scoped to tenant, RENTAL, validity window and branch in SQL.
export function selectedRentalPrice(rows: PriceRow[], branchId: string): PublicVariant["price"] {
  const price = rows.find(row => row.branchId === branchId) ?? rows.find(row => row.branchId === null);
  return price && price.amountMinor >= BigInt(0) ? { amountMinor: price.amountMinor.toString(), currency: price.currency } : null;
}
export function rentalPriceSummary(prices: PublicVariant["price"][]): PublicBrowseCard["priceSummary"] {
  const known = prices.filter((price): price is NonNullable<typeof price> => price !== null);
  if (!known.length || new Set(known.map(price => price.currency)).size !== 1) return null;
  const amounts = known.map(price => BigInt(price.amountMinor));
  return { minAmountMinor: amounts.reduce((a,b) => a < b ? a : b).toString(), maxAmountMinor: amounts.reduce((a,b) => a > b ? a : b).toString(), currency: known[0].currency, incomplete: known.length !== prices.length };
}
export function browsePriceText(summary: PublicBrowseCard["priceSummary"]) {
  if (!summary) return "Уточнить стоимость";
  const min = BigInt(summary.minAmountMinor).toLocaleString("ru-RU"), max = BigInt(summary.maxAmountMinor).toLocaleString("ru-RU");
  return (min === max ? min : min + "–" + max) + " " + summary.currency + " · аренда по каталогу" + (summary.incomplete ? "; цена части размеров требует уточнения" : "");
}
