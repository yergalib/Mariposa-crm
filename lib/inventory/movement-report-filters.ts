import { financePeriod } from "@/lib/finance/filters";
export function movementReportFilters(input: { from?: string; until?: string; variantId?: string; productId?: string; reportSearch?: string }) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const id of [input.variantId, input.productId]) if (id && !uuid.test(id)) throw new Error("Некорректный товар в фильтре.");
  const period = input.from || input.until ? financePeriod({ from: input.from, until: input.until }) : undefined;
  return { from: period?.from, endExclusive: period?.endExclusive, variantId: input.variantId || undefined, productId: input.productId || undefined, reportSearch: input.reportSearch?.trim().slice(0, 100) || undefined };
}
