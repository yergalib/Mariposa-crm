# Existing one-shot limiter: local budget checkpoint, 2026-10-09

This supersedes the budget assumptions in cad4c7d without adding another limiter. Only scripts/lib/assistant-smoke-once.cjs and its existing targeted test are changed. No endpoint, credentials, live runner or app flag is enabled.

## Admission and accounting

- The same exclusive-create, fsynced, approval-specific ledger reserves the whole original dollar once. It is never deleted, reset, refunded or relocated. Vercel execution remains rejected; this is a single isolated executor, not a distributed account quota.
- Six means **six total outbound HTTP attempts**, including input-token counting. A successful pair consumes two slots: at most three model generations. Failures count; the first uncertain count/generation/accounting result permanently closes the run. Neither endpoint retries, including timeout/429/5xx. Existing zero-retry SDK client and exact api.openai.com/v1 base URL are required; request-level retry override is also zero.
- The model is gpt-6-luna, service_tier is explicitly default, reasoning is exactly effort none / mode standard, max_output_tokens is 600. Extra reasoning fields, previous response/conversation references, tools, files, images, background and streaming parameters are rejected.
- 24,000 UTF-8 bytes is only a payload-size guard. Admission separately requires an integer response.input_tokens count <=24,000 from the documented input-token endpoint. Count and generation share the same owned, recursively frozen model/instructions/input/schema/reasoning. Mutation and serialization hooks cannot replace the counted request. No character/byte-to-token assumption is used.
- Response accounting requires the same model/tier, completed status, exact counted input total, <=600 output tokens, valid ordinary/cached/cache-write split and reasoning <= output. Reasoning is counted inside output, not billed twice. Missing or inconsistent usage blocks further requests and never releases reservations.
- Pricing expires at 2026-10-10 00:00 UTC. A later run fails closed pending a fresh official price review; this is not a perpetual price guarantee.

## Price derivation and limits

Official Standard short-context GPT-6 Luna rates, verified 2026-10-09, per million tokens: input $0.10, cached $0.01, cache write $0.125, output $0.50. All input is conservatively priced as cache writes. The input ceiling stays below the 272K long-context threshold.

Per generation: (24,000 * 0.125 + 600 * 0.50) / 1,000,000 = $0.0033.
Even six generations would be $0.0198. The actual three-pair plan has at most $0.0099 in generation token charges. The integer ledger holds four times the worst generation price **for every HTTP attempt**, including the count attempts: 6 * $0.0132 = **$0.0792**, below $1. Failed or ambiguous attempts retain the whole hold. SDK/network retries cannot increase the attempt count under this runner.

This is a local admission/reservation ceiling under the cited public model tariff, not a provider-side account spending limit. The token-counting documentation does not explicitly establish separate endpoint billing; this checkpoint does not invent a free-counting guarantee. Any account-specific charge, preflight fee or tax must fit the remaining authorization and be verified before live execution. The runner is not connected to a live client here. A separate confirmation of the safe executor, existing key/project association, and applicable billing remains required before a real smoke. No paid calls, including count calls, were made during this work.

Official sources:
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/guides/token-counting
- https://developers.openai.com/api/docs/guides/reasoning
- https://developers.openai.com/cookbook/articles/per_run_spending_controller_responses_api

## Verification

Targeted tests use an in-memory SDK-shaped fake and block network. They cover four-process atomic reservation, replay, six shared slots, mixed token accounting including cache writes/reasoning, exact count payload, caller mutation, getters, unknown modes/tiers/model, oversize/invalid/missing count, count/model timeouts, no retries/refunds, uncertain usage, expiry during preflight, stale prices and Vercel rejection. Real provider calls: zero. Evidence: C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-limiter-checkpoint-TGPO1X/limiter.log.

The earlier successful local build setup was recovered from task-3/verify.cjs and photo-final.cjs. Their allowlisted child environment uses only the synthetic postgresql://synthetic:synthetic@127.0.0.1:1/synthetic URL, not an accessible database or a secret. A build-only verification reuses that setup without executing those scripts' old edit operations or changing .env. This verifies compilation, not production database connectivity, live CRM data, intake, LLM or E2E.

Final results: targeted limiter PASS, scoped lint PASS, isolated Next production build PASS (including its TypeScript stage). Build evidence: C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-limiter-checkpoint-TGPO1X/build.log. No .env file changed. This resolves the earlier missing-DATABASE_URL build blocker only for the established synthetic compilation path, not for live integration.
