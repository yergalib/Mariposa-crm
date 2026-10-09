# Local conversation smoke adapter — 2026-10-09

Historical checkpoint. Superseded by [the three-generation full-window profile](ASSISTANT_FULL_WINDOW_SMOKE_20261009.md), which removes preflight and its pricing dependency.

The existing `scripts/lib/assistant-smoke-once.cjs` now supports the current conversation request and returns the existing `ChatProvider` result shape. There is one accounting engine and one unchanged approval identity/ledger location. No second limiter, app wiring, access-gate change, dependency, environment-file change, key lookup, payment change or network request was introduced.

## Completed program boundary

- Every model step deep-copies and freezes the complete supported request. Preflight receives identical model, instructions, user/assistant history, function calls/results, reasoning, tool definitions, tool choice, parallel-call setting and final JSON schema. Only generation-only fields (`store`, tier and output cap) are absent from the count request. Hidden server conversations, previous-response IDs, streaming, hosted/paid tools, images and files are rejected.
- Only the existing named function tools are admitted; tools are data for the provider. CRM tools remain the existing server implementation. The adapter does not execute tools or enable writes.
- The 48 KB bound admits the current conversation body; it is explicitly NOT a token estimate. Every generation still requires a fresh successful exact preflight count of at most 24,000 input tokens. The output cap is at most 1,400, matching the existing orchestrator, including reasoning tokens. Model/tier/reasoning stay fixed.
- Six HTTP method attempts total across the entire reserved run, including preflight, errors and all tool-loop rounds: at most three count/generation pairs. Additional turns or provider facades share that same allowance. SDK retries are disabled globally and per call. The single-executor atomic exclusive-create ledger reserves the existing $1 approval once; crash/replay cannot reclaim it. This is not a distributed application quota.
- Before preflight, reserve its **known maximum fee** plus worst-case generation cost (24,000 inputs at the highest admitted input/cache rate plus the request output cap). Both must fit the remaining allowance. No reservation is refunded on short output, failure, cancellation or timeout. Paid-call uncertainty permanently closes the run. Concurrent entry is rejected before another attempt starts.
- The previous stricter internal run ceiling remains $0.0792, below the approved $1. The old fixed per-attempt estimate has been replaced by pair reservations. `observedNano` records validated generation usage only; it is not a claim about the total account bill.
- Live construction additionally requires the private reservation permit, so a public `wrapReservedProvider` call cannot create a second live allowance. The callback to `runApprovedSmoke` receives the conversation-compatible provider and shares the reserved run across every invocation.

## Paid execution is still blocked, explicitly

`LIVE_READINESS` is frozen with `preflightMaxNano: null` and `safeExecutorPrepared: false`. Both public live entry points fail before touching a client or claiming the actual approval ledger. No option or environment variable enables them. A future readiness change needs verified pricing and prepared execution scope; this checkpoint does not claim those exist.

The synthetic factory accepts snapshotted JSON responses/counts, a test clock and a local pause promise. It cannot accept an SDK client, API key, URL or transport callback. It exercises the same private accounting engine and provider adapter with in-memory responses. Its default fee of 1,000 nano-USD is an invented fixture, not an OpenAI tariff. With that fixture, three maximum-size pairs reserve $0.011103; this is not a live price quote.

Checked official sources on 2026-10-09:

- [Token counting](https://developers.openai.com/api/docs/guides/token-counting): tools and schemas are counted together with input. The installed SDK's `InputTokenCountParams` also supports the full forwarded fields above.
- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna): Standard per-million-token rates are $0.10 input, $0.01 cached input, $0.125 cache writes and $0.50 output; policy freshness still expires at 2026-10-10 00:00 UTC.
- [Pricing](https://developers.openai.com/api/docs/pricing): neither this checked page nor the counting guide established a separate preflight charge or explicitly guaranteed it is free. Unknown remains unknown; no paid path is allowed. Account-specific premiums, taxes or other charges must also be resolved before a complete cost bound can be claimed.

## Targeted evidence

Final source-hash-verified run: `C:\Users\AMELIE~1\AppData\Local\Temp\mariposa-adapter-final-ufGk7A`.

- `assistant-smoke-once-targeted.cjs`: PASS. Atomic four-process reservation race and replay; remaining-budget boundaries; exhausted six-attempt allowance across facades; failures at every one of the six possible HTTP positions; no retries/refunds; parallel entry; mutation isolation; oversize/invalid counts; unknown price/usage; expiry, abort and close between count/generation; stale rates; both live entry points touch no client.
- `assistant-smoke-adapter-targeted.cjs`: PASS. Actual `runAssistantConversation` and actual CRM tool runner with synthetic service data: four-product comparison, two sequential `read_batch` tool rounds, final response. Exactly three generation responses and three counts; eight runner operations (twelve underlying synthetic service reads). Exact full preflight/generation equality at each step, including history, reasoning item and tool results. A following turn/facade cannot exceed the same run allowance.
- Scoped ESLint for these three CJS files: PASS. `results.json`, logs and `source-sha256.json` saved with the evidence. Real model/API calls: **0**. No full regression, build, publication or deployment was performed for this isolated script change.

## Minimal remaining user access/authorization

1. Provide or authorize a single isolated executor to use the **existing** key for the explicitly selected OpenAI project, through a secret binding that does not reveal its value in chat/logs or persist it in the checkout. No Vercel-secret extraction, new key creation or access to other projects is needed.
2. Allow read-only verification of that key's project association and that project's available credit/billing settings, if the owner has not already supplied trustworthy evidence. No billing write, top-up, limit increase or admin key is needed.

The one-time six-request/$1 smoke is already authorized; do not ask for that approval again. Official preflight-price verification is a technical prerequisite, not something permission can waive. Refreshing the dated tariff evidence and resolving readiness can be done after the necessary evidence/access exists. For this isolated smoke, use synthetic CRM data and the injected provider directly: no deployed access-gate change, intake/LLM enablement, live inquiry, Production access, schema migration or deployment is required. Any future website activation/publication remains a separate scope.
