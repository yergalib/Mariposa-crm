// Local owner-window policy. Deployment requires matching explicit price acknowledgement.
// Official Standard rates checked 2026-10-21:
// https://developers.openai.com/api/docs/models/gpt-6.1-sol
// Astra was rejected on cost; Sol is approved for bounded evaluation.
export const SOL_CANDIDATE = {
  model: 'gpt-6.1-sol', serviceTier: 'default', reasoning: { effort: 'low', mode: 'standard' },
  inputNanoPerToken: 2_000, cachedInputNanoPerToken: 100,
  cacheWriteNanoPerToken: 2_500, outputNanoPerToken: 10_000,
  // Inherit approved input/output caps until measured evaluation supports a change.
  planningInputCap: 128_768, planningOutputCap: 1_400,
  reviewInputCap: 16_000, reviewOutputCap: 300,
  dailyBudgetNano: 10_000_000_000, dailyCalls: 100,
} as const;
export function solReservation(inputCap: number, outputCap: number) {
  if (!Number.isSafeInteger(inputCap) || inputCap < 1 || inputCap > SOL_CANDIDATE.planningInputCap ||
      !Number.isSafeInteger(outputCap) || outputCap < 1 || outputCap > SOL_CANDIDATE.planningOutputCap) throw new Error('unsupported reservation');
  // Highest cache-write rate, no optimistic cache discounts, 10% margin.
  const base = BigInt(inputCap) * BigInt(SOL_CANDIDATE.cacheWriteNanoPerToken) + BigInt(outputCap) * BigInt(SOL_CANDIDATE.outputNanoPerToken);
  return (base * BigInt(110) + BigInt(99)) / BigInt(100);
}
export function solTurnEligibility(remainingNano: bigint, remainingCalls: number, planningCalls = 1) {
  if (!Number.isInteger(planningCalls) || planningCalls < 1 || planningCalls > 3 || !Number.isInteger(remainingCalls) || remainingCalls < 0 || remainingNano < BigInt(0)) throw new Error('invalid remaining budget');
  const reservedNano = BigInt(planningCalls) * solReservation(SOL_CANDIDATE.planningInputCap, SOL_CANDIDATE.planningOutputCap)
    + solReservation(SOL_CANDIDATE.reviewInputCap, SOL_CANDIDATE.reviewOutputCap);
  return { reservedNano, calls: planningCalls + 1, allowed: remainingCalls >= planningCalls + 1 && remainingNano >= reservedNano };
}
