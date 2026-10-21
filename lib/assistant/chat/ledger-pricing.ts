// Immutable server-side tariff registry. Never edit a published version: add a new one.
export const LEDGER_PRICES = {
  'gpt-6.1-sol:2026-10-21:standard:2.00:0.10:2.50:10.00': { model: 'gpt-6.1-sol', input: 2000, cached: 100, write: 2500, output: 10000 },
  'gpt-6-luna:2026-10-20:standard:0.10:0.01:0.125:0.50': { model: 'gpt-6-luna', input: 100, cached: 10, write: 125, output: 500 },
  'gpt-6-luna:2026-10-11:0.125:0.5': { model: 'gpt-6-luna', input: 100, cached: 10, write: 125, output: 500 },
} as const;
// Unattributed legacy rows keep at least the existing Sol-era charge. This is
// an uncertainty allowance, NOT an assertion that their model was Sol.
export const LEGACY_ALLOWANCE = { planning: 369_512_000, review: 47_300_000 } as const;
export function ledgerPrice(version: string, model: string) {
  const price = LEDGER_PRICES[version as keyof typeof LEDGER_PRICES];
  if (!price || price.model !== model) throw new Error('Unknown ledger tariff');
  return price;
}
export function verifiedLedgerUsage(response: unknown, snapshot: { model: string; pricingVersion: string; inputCap: number; outputCap: number; reservedNano: bigint }) {
  const r = response as { id?: string; model?: string; status?: string; service_tier?: string; usage?: { input_tokens: number; output_tokens: number; total_tokens: number; input_tokens_details?: { cached_tokens: number; cache_write_tokens: number }; output_tokens_details?: { reasoning_tokens: number } } };
  const u = r?.usage, integer = (x: unknown, min: number, max: number) => Number.isSafeInteger(x) && Number(x) >= min && Number(x) <= max;
  if (!r || typeof r.id !== 'string' || !/^resp_[A-Za-z0-9_-]{1,180}$/.test(r.id) || r.model !== snapshot.model || r.status !== 'completed' || r.service_tier !== 'default' || !u
    || !integer(u.input_tokens, 1, snapshot.inputCap) || !integer(u.output_tokens, 0, snapshot.outputCap) || u.total_tokens !== u.input_tokens + u.output_tokens
    || !integer(u.input_tokens_details?.cached_tokens, 0, u.input_tokens) || !integer(u.input_tokens_details?.cache_write_tokens, 0, u.input_tokens)
    || u.input_tokens_details!.cached_tokens + u.input_tokens_details!.cache_write_tokens > u.input_tokens
    || !integer(u.output_tokens_details?.reasoning_tokens, 0, u.output_tokens)) throw new Error('Unverified ledger usage');
  const cached = u.input_tokens_details!.cached_tokens, writes = u.input_tokens_details!.cache_write_tokens;
  const price = ledgerPrice(snapshot.pricingVersion, snapshot.model);
  const cost = BigInt(u.input_tokens - cached - writes) * BigInt(price.input) + BigInt(cached) * BigInt(price.cached) + BigInt(writes) * BigInt(price.write) + BigInt(u.output_tokens) * BigInt(price.output);
  if (cost > snapshot.reservedNano) throw new Error('Usage exceeds reservation');
  return { responseId: r.id, cost, usage: { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cachedInputTokens: cached, cacheWriteTokens: writes, reasoningTokens: u.output_tokens_details!.reasoning_tokens } };
}
