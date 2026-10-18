# Final bounded live-model acceptance — manual review

Runner checkpoint: `a7480344b23910354eeab70af515ce8b61195d46`; application fix `cff3c8843833a3f951e636286e4bf2a89d5fda75`. Owner entered the existing key in the visible private masked-input console. The agent did not read, paste, log or save the key. One launch only; no retry.

The run stopped at its authorized 18-new-call cap: attempts 253–270, total 270, reserved $4.988412 of $5, unreserved $0.011588. There is no attempt 271. All 18 new attempts have accepted usage. Unknown old attempts remain 1, 2, 132, 136 with no reserve refund. Original first-252 ledger fingerprint remains `ae1e495ebf233556320c31cb29b353afd35a8ee3bb5b7a68d597259c8df0bda8`.

## Manual results

| Scenario | Outcome | Evidence |
| --- | --- | --- |
| size-colour-empty | PASS within observed synthetic CRM scope | 8 calls. First reply returns verified blue size-146 variant 23, catalogue amount 13000 KZT. Dates 25–26 October, height 138 and comfort preference survive. Second reply truthfully describes an empty bounded batch, with no stale card or whole-catalogue absence claim. Both reviews completed and allowed (28/30 output tokens). |
| recover-tool-error | PASS within observed synthetic CRM scope | 7 calls. Initial catalogue error produces no invented card; preferences remain. Recovery returns verified blue size-140 variant 21, amount 12000 KZT, with dates/height/comfort retained. Both reviews completed and allowed (29/27 tokens). Initial error wording refers to unconfirmed search criteria and could be clearer, but does not claim successful availability or booking. |
| negative-then-positive | PENDING — interrupted by budget | 3 calls consumed before the first review. The first saved reply is a safe clarification, with the old white/140/date/height context preserved. No reviewer response exists for that turn; the second user turn was not executed. The new fallback does not accept the proposed note without review. This is not a completed test, not PASS, and not evidence of a newly malformed provider verdict. |

The runner's scorecard reports zero completed turns for the interrupted third scenario because the next beginTurn threw at the shared stop and its catch preserved the initial pending entry. The actual `turn-1.json` exists: it records a returned safe fallback, not a reviewed semantic success. Keep both original automatic evidence and this qualification; do not overwrite historical output to imply completion.

All five stored replies and all three traces were inspected. The two successful dialogues had four parseable allowed reviews, no fabricated price, fit guarantee, booking or completed handoff claim in the observed scope. No new malformed/truncated verdict was produced by the provider in this run; those fault paths retain offline evidence only. Synthetic catalogue availability is not real inventory verification.

## Comparison and launch remainder

Comparison status remains **API PASS from prior critical3 / UI PASS locally / live after latest fix NOT RERUN**. It was deliberately excluded from this paid continuation; do not convert reused evidence into a new live PASS.

The only unfinished dialogue in this final three-scenario run is negative-colour exclusion followed by positive replacement. The $0.011588 remainder is below one conservative call reservation ($0.0184756), so no further paid call is permitted under this ledger. Any additional acceptance spend needs a separate owner decision; do not reset the ledger or reuse a consumed launcher. Final deployed UI acceptance/publication and real unavailable inventory remain outside this run. WAF and real data were untouched.

Evidence: `evidence/assistant-final-20261018/` contains original run summary, scorecard, exact synthetic replies, sanitized tool/reviewer traces and ledger integrity check. The original files and budget markers remain unchanged. No push/deploy, new key, real CRM write, payment, reservation or WAF change occurred.
