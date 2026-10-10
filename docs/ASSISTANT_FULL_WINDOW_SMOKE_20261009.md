# Three-generation full-window smoke profile — 2026-10-09

Supersedes the preflight-based profile in `ASSISTANT_SMOKE_ADAPTER_20261009.md`. The same limiter, approval identity and exclusive one-shot ledger remain. No live request, key access, environment change, app access-gate change, push or deployment occurred.

## Independently verified cost bound

[GPT-6 Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) gives a 1,050,000-token context window, Standard input/cache-write/output rates of $0.10/$0.125/$0.50 per million, double input/cache rates and 1.5x output rates above 272K input, and a 10% regional premium. Thus the highest admitted input category is long-context cache-write at $0.25/M; output is at most $0.75/M before the regional premium.

[Prompt caching, Calculate input cost](https://developers.openai.com/api/docs/guides/prompt-caching) subtracts cache reads and cache writes from ordinary input before applying their rates. Cache-write replaces ordinary pricing for those tokens; it is not an extra $0.25 on top of ordinary input pricing.

[Conversation state](https://developers.openai.com/api/docs/guides/conversation-state) defines the context window as the maximum tokens in one request, including input/output/reasoning. Charging the entire window as input PLUS 1,400 output deliberately overestimates the feasible combination. [Reasoning, Controlling costs](https://developers.openai.com/api/docs/guides/reasoning) states that `max_output_tokens` covers visible output, reasoning and non-visible formatting tokens. The installed SDK parameter documentation agrees. The supplied token-counting guide establishes input-count semantics, but the direct source for the output-cap claim is the reasoning guide.

Arithmetic, checked again with integer nano-USD in tests:

```
per attempt = (1,050,000 × $0.25 + 1,400 × $0.75) / 1,000,000
            = $0.26355
three attempts = $0.79065
with 10% regional premium = $0.869715
reservation per attempt including premium = $0.289905
```

This is a conservative **token-charge ceiling**, not a local token count, a 24K input cap, or a guarantee of the final account/card debit. Taxes, currency conversion, account-specific charges and unrelated concurrent account usage are outside this calculation. The $0.130285 difference to $1 is not assumed sufficient for unknown extras. Account scope and any extra charges must be resolved before live execution; the live entry remains blocked. Rates expire at 2026-10-10 00:00 UTC and must be revalidated afterward.

## Implementation

- Maximum **three generation HTTP attempts total** across all turns, tool-loop rounds and provider facades. No preflight method exists in the profile, and no count endpoint is called. Zero SDK/per-request automatic retries; failures stop the run and cannot regain a slot.
- Before any await or transport invocation, atomically check the available allowance, increment the attempt count and reserve $0.289905 synchronously in the single executor. Every admitted attempt keeps the full reserve on failure, incomplete/uncertain response, abort, expiry or short output. Parallel entry is rejected. The durable exclusive-create ledger reserves the entire existing $1 one-shot approval before a live wrapper can exist; crashes/restarts cannot reuse it. The ledger path/approval ID did not change, so a claim under the previous profile also blocks replay.
- The internal token-charge ceiling changes from the former small-input estimate to the proven $0.869715 full-window reserve, still within the approved $1. The HTTP ceiling narrows from six to three. This is the sole profile, with no fallback to the former preflight path.
- Immutable full conversation snapshots and strict request allowlists remain. Only existing function tools are allowed; hosted tools, images/files, server-side conversation IDs, background/streaming, other tiers/models and unsupported request parameters are rejected. No CRM tool or application gate is changed.
- `max_output_tokens <= 1400`, model `gpt-6-luna`, Standard tier/default and standard/none reasoning remain fixed. The 48 KB request cap is solely a byte guard. The old 24K input claim is removed. Post-response usage must fit the documented context and requested output cap; unknown usage closes the run. `observedNano` is now a conservative usage-based bound using long-context rates and regional premium, not a literal invoice amount.
- Live readiness remains frozen false. Neither public live entry touches a client or claims the actual ledger. The synthetic fixture transport accepts only owned JSON responses, a clock and a pause promise, with no SDK/network client injection.

## Evidence

`C:\Users\AMELIE~1\AppData\Local\Temp\mariposa-adapter-final-DxX6OQ`: `results.json`, source SHA-256 manifest and complete logs.

Both targeted suites and scoped ESLint passed. Coverage includes exact integer cost arithmetic, exclusive four-process claim race/replay, budget boundaries, all three failure positions, eight competing concurrent calls, mutable-request isolation, shared allowance, expiry/abort/close, invalid/unknown usage, hosted tool rejection, no preflight transport and blocked live entries. The actual conversation orchestrator compares four synthetic products through two batch tool rounds and a final response: exactly three generation attempts, zero counts, then the next turn is blocked. Real API calls: **0**. No full regression/build was run for this script-only change.

The preflight-price blocker is removed by eliminating preflight. Remaining blockers are the prepared isolated executor, verified project/key association and account-specific charges; no secret access or billing change was attempted here.
