import { SOL_CANDIDATE } from './sol-candidate';
export type UsageSummary = { model: string; inputTokens: number; outputTokens: number; cachedInputTokens: number; cacheWriteTokens: number; estimatedCostUsd: number; latencyMs: number };
// Call only after verifiedOwnerUsage. Provider billing remains the final invoice;
// output_tokens already includes reasoning, so it is never charged twice here.
export function usageSummary(response: unknown, latencyMs: number): UsageSummary {
  const r = response as { model: string; usage: { input_tokens: number; output_tokens: number; input_tokens_details: { cached_tokens: number; cache_write_tokens: number } } };
  const u = r.usage, cached = u.input_tokens_details.cached_tokens, writes = u.input_tokens_details.cache_write_tokens;
  const sol = r.model === SOL_CANDIDATE.model;
  if (!sol && r.model !== 'gpt-6-luna') throw new Error('unsupported usage model');
  const rates = sol ? [2000, 100, 2500, 10000] : [100, 10, 125, 500];
  const nano = (u.input_tokens - cached - writes) * rates[0] + cached * rates[1] + writes * rates[2] + u.output_tokens * rates[3];
  return { model: r.model, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cachedInputTokens: cached, cacheWriteTokens: writes, estimatedCostUsd: nano / 1e9, latencyMs };
}
