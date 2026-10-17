# New resume transport stop at attempt 136

Evidence source: `../assistant-smoke-approval-20261016-144953/evaluation-repeat-16-resume132`, plus `attempt-133..136.json`, `usage-133..135.json` and `failure-136.json` in the same original ledger.

Four new requests were attempted. Attempts 133, 134 and 135 received HTTP 200 with accepted usage. Attempt **136** started **2026-10-17T06:30:28.592Z** and failed at **06:30:53.677Z**, **25.085 seconds** later. Its transport log contains HTTP_START followed by TRANSPORT_ERROR and **no HTTP status**. Failure stage is TRANSPORT, observed response is null. This is not a recorded HTTP 401 or model-output failure.

The direct transport's existing socket inactivity timeout is 25,000 ms. The duration strongly suggests that timer fired, but the old log discarded the socket error code and did not distinguish the timeout callback from another network error. DNS/TLS/socket/timeout root cause cannot be proved retrospectively. No claim that the key is invalid or that the provider was unavailable is supported.

The first turn of colour-cheaper completed: one verified white card, valid variant reference, reviewer completed in 29 output tokens with allow. The initial planning request of turn two failed before a model response. The scenario is task FAIL / safety INCOMPLETE_OR_FAIL; only one completed turn is saved. All other fifteen scenarios are explicitly NOT_RUN / safety NOT_EVALUATED. No new passing dialogue result exists.

Budget unchanged except the four actual debits: **136 attempts, $2.5126816 reserved**, **$2.4873184 unreserved** under the same $5 total. The new reserve increment is **$0.0739024**. Accepted usage estimate for 133–135, with margin, is **$0.000800305**; cumulative known estimate **$0.015066587**, not a provider invoice. Attempts 1, 2, 132 and 136 remain unknown-usage and fully reserved.

## Local diagnostic correction

The consumed runner now has an observer around its existing request function. It records only allowlisted codes and stages (DNS/TCP/TLS/response), elapsed milliseconds, configured timeout and whether a response was received. The timeout callback is recorded before the existing destroy call, distinguishing timeout from its resulting ECONNRESET. Headers, addresses, request options, raw messages and response bodies are never persisted. Unknown error codes are null. It uses the identical request/options, timeout and auth path; it adds no retry, network probe or paid call. The historical transport implementation and its 25-second timeout are unchanged.

Offline tests: synthetic timeout at 25.085 seconds, DNS failure, TLS certificate failure, socket reset, unknown-code stripping, abort, unchanged success; actual direct transport with in-memory request objects. Lifecycle regression continues to pass, including HTTP 401, incomplete review, reservations and NOT_RUN persistence. Scoped ESLint passed.

The real transport failure has not been demonstrated fixed; this change fixes the loss of diagnostic information. No ledger record, claim or prior result was modified; no new resume was enabled. No key was read/requested and no paid run was retried. A further owner action is not requested before the remaining transport blocker is addressed.
