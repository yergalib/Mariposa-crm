# Local continuation candidate — not deployed, migration NOT applied

Measured release 023122a: planner + validated catalogue + final planner consumed about20seconds; reviewer admission had4899ms remaining. Increasing request timeout is not this proposal. Keep25seconds per request and the independent semantic review.

## Minimal flow in the same Next.js application and database

1. Browser supplies one UUID idempotency key for a user turn. Before any paid planning, insert a scoped checkpoint (`planning`) or return the existing turn. Same key with a different input hash conflicts. Owner/session/organization/membership/branch rights and Origin are checked on every request using current guards.
2. Existing planner/tools run. Before reviewer, persist a server-generated candidate: proposed context, quoted preference/calendar evidence, bounded candidate prose, verified DTOs and their checked-at timestamps. No raw tool instructions, credentials, customer records or financial records. Finish the first HTTP request with202 and an opaque checkpoint ID; do not expose candidate prose/cards as approved.
3. UI automatically requests continuation under the same session. Atomic compare-and-set `review_ready -> review_running` gives exactly one caller permission to invoke the existing reviewer through existing provider accounting. A fresh25second request budget is now dedicated to review, not another planning/search run. No provider retries and no second planning charge.
4. Save final reviewed response before returning it. Lost HTTP acknowledgement is handled by reading the saved result; concurrent polls never invoke another reviewer. Unknown provider outcomes remain blocked; do not generalize the old one-row reconciliation.
5. Recheck current permissions/window before displaying a result. Product facts are snapshots, not bookings. If their age exceeds the accepted freshness bound, refresh those DTOs through the existing tenant/branch/public-product services without an LLM call; never silently re-use stale availability. Keep the same date-only semantics.

## Local implementation and limits of verification

`lib/assistant/chat/review-continuation.ts` implements the orchestration and repository contract: idempotent planning, hidden pending candidate, one claimed review, saved-result replay, expiration, conservative block on error. It has NO route imports and is not active.

`docs/sql/assistant-review-checkpoint.candidate.sql` is the additive one-table candidate with scope/idempotency identity, bounded payloads, lifecycle checks, transition trigger and RLS/no public policies. No change to provider attempts, retained unknown, business tables or existing privileges. The new table revokes anon/authenticated/Public access rather than widening access.

`scripts/assistant-review-continuation.cjs` tests real orchestration with an atomic in-memory repository plus candidate DDL/CAS in PGlite: duplicate planning, changed-input conflict, simultaneous review requests, result replay, expiration, unknown blocking, one SQL claim, immutable identity and no state reset. This is NOT a live provider test, not a deployed SQL repository adapter, and not a finished UI integration.

Remaining implementation after schema approval: production repository adapter with current owner guards and transaction-window checks; extract the existing final-review boundary into serializable draft/finalizer while retaining every grounded validation; wire202/poll UI with the same idempotency key; attach attempts/phase counts and fixed policy snapshot to each checkpoint so a resumed turn cannot gain another call budget. Review still reserves through provider-budget; whole-turn ceiling and daily$10/100 remain unchanged. An intervening budget/window exhaustion stops continuation without restarting planning.

## Required explicit approval before applying

Create this operational checkpoint table and temporarily store bounded draft text, preference context and verified product snapshots on the existing MARIPOSA database. This is separate from optional7-day conversation history. Checkpoints usable for at most10minutes; no raw text should be logged. Pending candidate removed on successful completion. Expired payload cleanup must be implemented and authorized for THESE NEW service records only, retaining idempotency tombstones through the test window; no old history or ledger deletion. TTL validity alone is not automatic physical erasure, so do not promise timed deletion before cleanup is implemented.

No new service, key, public API access, model, budget or staff rights. No schema applied, paid calls, publication or live business records in this preparation. Current released application remains023122a.

Rollback: keep the additive table and disable continuation routing; never drop checkpoints or erase accounting as rollback. A running/unknown attempt remains blocked. An unavailable checkpoint cannot justify replaying a paid request.
