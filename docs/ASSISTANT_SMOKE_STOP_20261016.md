# Stopped smoke at 15:07 UTC

Read-only incident inspection: `../assistant-smoke-approval-20261016-144953` contains only `started.json`, `attempt-1.json`, and `result.json`. First attempt was reserved at 15:07:05 UTC; STOPPED result at 15:07:06 UTC. First-turn payload was 16,581 bytes. Result records one attempt and USD 0.0184756 reserved, with no retry.

There is no usage artifact, HTTP status, failure diagnostic, or completed reviewed turn. Consequently the exact underlying failure and actual provider charge cannot be recovered from this run's artifacts. The attempt record is written before transport and proves reservation, not successful HTTP delivery. No assertion of zero charge or successful model answer is warranted. Treat the full USD 0.0184756 as consumed allowance; remaining unreserved authorization is USD 0.2315244. The one-shot approval stays locked, with no automatic resumption or new allowance.

Confirmed runner defect: it collapsed transport, response validation and usage persistence failures into the same STOPPED result without retaining a nonsecret stage. Minimal repair adds an allowlisted stage, HTTP status/error category, and boolean/numeric response metadata. It never records error messages, credentials, headers, request IDs or raw model output. Missing usage counters still stop the run; guards are not weakened based on speculation about this failure.

Validation after repair: diagnostic isolation tests PASS (transport vs response validation, missing counter, no secret/text retention, HTTP allowlist, unchanged debit/no retry); 17 budget tests PASS; actual three-turn pipeline with nine scripted calls PASS. All offline, zero HTTP calls. Original three incident files unchanged. No repeat launch, key read, ledger reset, deployment or application runtime change.

Next safe action: report the indeterminate original cause. Any further paid diagnostic requires explicit authorization and an accounting continuation preserving this spent reserve, rather than deleting the one-shot ledger. Read-only provider-side usage evidence supplied by the user could establish actual charge, but is not available here.
