# Resume after attempt 132

Use the existing `scripts/START-ASSISTANT-REPEAT-16.cmd`. It now requires the saved STOPPED result at attempt 132 and all 132 prior reservation records. Old results and the consumed first continuation marker remain untouched. A fresh exclusive `evaluation-repeat-16-resume132-started.json` marker is claimed only after manual protected key entry. Readiness checks create neither the marker nor a reservation.

The repeat starts all sixteen scenarios afresh: the first previously failed; the other fifteen never ran. The first new attempt is 133. Limits: 32 turns, four calls per turn, **128 new calls**, **260 total calls**, no transport retries and no automatic scenario rechecks. Reviewer output cap is 300; planning cap remains 1400. Every call already reserves against the larger 1400 output bound, so the reviewer increase does not require a larger debit.

Exact integer budget: prior **2,438,779,200 nano-USD** + 128 × **18,475,600** = **4,803,656,000 nano-USD ($4.803656)**. The $5 ceiling remains explicit; residual headroom after the maximum is **$0.196344**. Unknown historical usage remains reserved. No old debits are refunded or reset. This is a conservative engineering reserve, not a provider billing cap.

Expiry unchanged from the authorized continuation: **17 October 2026, 23:59:59 UTC+05 (18:59:59 UTC)**. A session lasts at most two hours and cannot outlive that cutoff.

## Offline lifecycle checks

- Actual runtime, synthetic public CRM tools and budget wrapper reproduce a second-turn reviewer that is incomplete at 300 tokens, both with usage and without usage. Both stop without retry/refund, persist the fallback as task FAIL and mark all remaining scenarios NOT_RUN / safety NOT_EVALUATED.
- The actual direct HTTPS transport is exercised with an in-memory request object returning HTTP 401. Exactly one simulated send, one durable debit, saved HTTP status and no retry.
- A local invalid card ID fails its scenario while subsequent scenarios run; validation is not loosened. All sixteen scenario paths are exercised through the actual request snapshot limits with scripted responses, with no automatic PASS for a generic acknowledgement.
- Call 129 and turn 33 are blocked; exhausted limits close the allowance before transport. Results and NOT_RUN rows are persisted even when the runner begins with a closed allowance. The global result includes an allowlisted stopReason; the console displays that reason rather than only EVALUATION_STOPPED.
- Nested `read_batch` / `find_cheaper` is recognized in safe traces; no arguments or IDs are logged.
- Prior 132 records remain byte-identical in fixture tests, double claim fails, unknown usage retains its debit, expired/inconsistent histories are refused.

PASS: `assistant-resume-lifecycle-test.cjs`, `assistant-repeat-16-test.cjs`, `assistant-review-cap-regression.cjs`; scoped ESLint. Actual `.cmd --check` from System32: **READY: no secret read, no HTTP calls.**

Other bounds were exercised, not silently removed: a representative six-sentence review with dates, three retained preference notes, three slots and a colour correction serializes to **4828 bytes**, below the existing 8000-byte review cap. The two-turn fixtures fit the 48000-byte planning cap and two tool rounds (remember → batch → final → review). Larger/complex requests still stop honestly with REQUEST_POLICY_LIMIT, CALL_OR_TURN_LIMIT or another explicit reason. These offline results do not prove a live model will always complete within 300 review or 1400 planning tokens.

New evidence directory after manual launch: `../assistant-smoke-approval-20261016-144953/evaluation-repeat-16-resume132`. Scorecard lists all sixteen scenarios from the start, RUNNING while active and explicit NOT_RUN entries after a stop. Task success and safety remain separate; completed deterministic checks still require semantic review.

No paid call, secret read or key prompt occurred during preparation. The owner's only action is to open the same launcher and enter the key once in its protected local window. No live success is claimed.
