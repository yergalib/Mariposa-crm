# Unified local candidate after attempt 136

The existing `scripts/START-ASSISTANT-REPEAT-16.cmd` now prepares a single bounded repeat from **136 attempts / $2.5126816 reserved**. Old evidence and claims are preserved. New evidence goes to `evaluation-repeat-16-resume136`; its exclusive marker is created only after manual protected key entry. No paid call or secret read occurred during preparation.

## Transport and lifecycle

The evaluation now uses a dedicated direct HTTPS transport with **90,000 ms socket inactivity and absolute request deadlines**. Fixed host/path, no redirects, no paid automatic retries, 262144-byte response cap, masked in-memory key transfer and strict usage/response verification are retained. The older smoke transport and production application provider settings are unchanged. The previous 25-second transport deadline was unsuitable for a deliberately bounded evaluation when model latency exceeds 25 seconds; it was a client-side timer, not a provider requirement.

Offline virtual-clock tests exercise the actual new transport plus durable budget wrapper: responses at **35 s** and **89 s** succeed; at **90 s** the request is destroyed and the unknown reservation remains charged. Separate HTTP **401**, **429**, **503** results stop once, preserve the status, and never retry. These are simulated responses, not a paid/network test.

The other duration bounds were aligned: a turn allows **380 s** (four 90-second calls plus cleanup). The previous 115-second turn timer could prematurely abort a later call even with the new transport timeout. The session remains at most **two hours**, bounded by the existing **17 October 23:59:59 UTC+05 / 18:59:59 UTC** expiry. Each request also receives the remaining session deadline as an abort signal. The outer process watchdog allows 20 s and the PowerShell watchdog 30 s of cleanup after the two-hour bound, so result persistence is not raced by an immediate process exit; this does not authorize requests after the session deadline.

The complete runner tests still verify incomplete reviewer responses with and without usage, nested read_batch tools, durable failure results, local ID failure followed by later cases, budget/call/turn stops, duplicate-claim refusal, and NOT_RUN entries for unattempted cases. Generic fallback remains task FAIL. Transport errors now propagate allowlisted specific stop reasons such as EVALUATION_TIMEOUT / HTTP_429 rather than only a generic failure.

## Output and other bounds

Reviewer JSON contains only three fields: at most six integers 0–19, one of two preference decisions, and one of five fixed reason strings. The longest compact JSON instance is **105 ASCII bytes**. **300 output tokens** provides a reasonable margin for that constrained answer; 150-token complete fixtures pass, while incomplete/malformed/over-cap responses still fail closed. This is not a mathematical guarantee that a live model avoids whitespace, an incomplete response or a service-side interruption. There is one reviewer per final response and no extra repair call. Raising to the 1400 planning cap or adding retries is not justified by this schema.

Representative six-sentence review input is **4828 bytes**, within the 8000-byte review bound. Sixteen scenario fixtures exercise the actual 48000-byte planning request validator and bounded two-tool-round path. Four products can be read in a batch. Planning output stays 1400, CRM reads 8, and tool-result cap 12000 bytes; these are intentional bounded-tool safeguards, not silently removed checks. More complex requests may still stop explicitly. Two hours also cannot guarantee completion if every one of 128 requests consumes nearly 90 seconds; any such stop preserves results and NOT_RUN labels.

## Budget and verification

All **16 scenarios / 32 turns / at most 128 new calls** fit. 136 + 128 = **264 total attempts**. Exact reserve: 136 × 18,475,600 + 128 × 18,475,600 = **4,877,558,400 nano-USD ($4.8775584)**. Remaining headroom at that maximum: **$0.1224416**. The explicit $5 ceiling, 1400-token per-call reserve basis, and all unknown historic reservations are unchanged. This is an engineering reserve, not a provider billing cap.

PASS: `assistant-evaluation-transport-test.cjs`, `assistant-repeat-16-test.cjs`, `assistant-resume-lifecycle-test.cjs`, `assistant-review-cap-regression.cjs`, scoped ESLint. Actual launcher `--check` from System32: **READY: no secret read, no HTTP calls.**

Remaining uncertainty: the exact original socket error was not retained, and no real request has verified the new 90-second behavior. Provider/network errors or response truncation remain possible. This candidate removes the demonstrated local timing conflict and improves honest failure reporting; it does not claim live task success.
