# Budget settlement proposal — NOT active

Published message fix only: f7e667062506bf18c1a8466d7c810e2084716f95; READY dpl_6za9TZApbYhxvDWB1yTHjbsJoPHn. No paid test or accounting mutation.

## Read-only evidence
All53attempts for exact MAIN owner inspected.31verified receipts,1reserved unknown,21legacy rows without model/tariff/usage. No malformed receipt IDs or duplicate receipt IDs. Recalculation of all31confirmed costs matches persisted cost exactly (0invalid).

For22October Asia/Almaty (21Oct19:00Z inclusive–22Oct19:00Z exclusive):32calls; historical reservations9.568900USD; confirmed token-derived cost0.3543275USD; unknown reserve0.047300USD; no other pending/unknown. Proposed debit0.4016275USD; potential headroom9.5983725USD. This is NOT applied.

Across all53: historical reservations15.717592USD; verified costs0.3543275USD; legacy uncertainty allowance6.148692USD plus known unknown0.047300USD; conservative proposed total6.5503195USD. Legacy costs are unknown, not zero. These are application accounting values, NOT a complete provider invoice/card bill; no external billing account reconciliation was available.

The previous policy explicitly sums immutable reserved_nano (or legacy allowance) irrespective of usage_state. Its code comment says actual cost never discounts daily debit. Thus no stuck lease is needed to exhaust the daily allowance.

## Concrete activation change, approval required
Keep every immutable reservation, original creation time, snapshot, receipt and call count. Change only budget projection used by full-turn admission and transactional per-call admission: validated verified receipt contributes actual_cost_nano; pending/unknown/legacy contributes full existing reserve/allowance. Do not subtract/refund/update rows. No migration needed. Runtime is still using reservation-only projection. Candidate is scripts/settled-budget-candidate.cjs, never imported by application.

Receipt validation: same immutable model and registered pricing version; unique valid response ID; completed/default-tier response already enforced by original writer; integer token bounds, cache+write<=input, reasoning<=output; exact persisted-cost recalculation<=reservation. Reasoning tokens are already part of output, not billed twice. Missing/malformed/unknown-price/mismatching receipt retains full reserve and must block admission for investigation, not silently release liability. A receipt is sufficient for this bounded internal calculation under the existing tariff contract; it is not cryptographic invoice verification or a guarantee against external billing adjustments.

## Concurrency and dates
Read budget and insert each reservation inside the SAME existing organization advisory-lock transaction; settle receipts under that lock as today. One reserved attempt remains operationally blocking; only the already approved exact historical exception remains. No new exception. A repeated identical receipt cannot refund twice: the projection always reads the one immutable row, and unique response ID plus current idempotent writer remain. Keep full-turn preflight and per-call checks; neither may mix old/new projection. Existing whole-turn check is not an escrow for every future stage: another allowed turn can consume headroom between stages, and continuation must then fail closed rather than exceed10USD.

Attribute cost/reserve to immutable request-created day in Asia/Almaty, not receipt time: settlement crossing midnight cannot move or erase an earlier call. Day turnover creates no updates. Unknown activity remains globally checked across days; existing exact retained exception unchanged. UTC19:00 boundary is tested. New actual usage after an unknown requires its normal verified immutable receipt path, never a fabricated estimate.

## Local checks and risk
Offline projection tests cover mixed snapshots, cache/read/write/reasoning, receipt failures, unknown/legacy preservation, exact day boundary, duplicate/idempotent inputs. All53real rows replayed locally with zero mismatch, zero network/write. No claim of new concurrent PostgreSQL integration testing: before activation, wire projection into both real admission paths and run existing PGlite concurrency/idempotency tests plus a settlement/admission race fixture. Fail closed on invalid evidence. Rollback is old projection only, no destructive down or history changes.

## Original question
Stored input: «Нужно желтое платье, размер140, на завтра» (actual spacing: «размер 140»). No duration. Asking how many days was appropriate; this is successful clarification/review, not a completed availability selection.

Approval scope requested: allow application budget projection to charge verified actual usage plus retained unknown/pending allowances within unchanged10USD/100calls/day. No budget increase, reserve-field mutation, reset, migration, new live test or business data changes.
