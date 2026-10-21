# Local integrated continuation — NOT applied or published

Implements the candidate from AI-REVIEW-CONTINUATION-LOCAL.md. This document supersedes its proposed payload cleanup: NO deletion, expiry cleanup, nulling of stored candidates, or retention job is implemented or authorized here. Ten minutes limits use, not physical retention. Existing history and ledger are untouched.

## Implemented locally

- Current assistant POST accepts an idempotency header. Original planning creates a scoped checkpoint before paid work. Same key/body reuses it; changed body conflicts. Resume uses only the key and the same authenticated owner/session. Existing legacy requests retain the original guarded synchronous path.
- Current owner, CATALOG_VIEW, organization/membership/session, Origin and database window guards remain. Every repository operation rechecks them. No new credentials, roles, public policy or external service.
- Planning stops immediately before semantic review. Store only bounded input context, latest user/previous assistant (older user message replaced by a neutral placeholder), already-verified planning outputs and fixed model/pricing policy/calendar anchor. Drop provider usage and unused output metadata from the replay tape. Known contacts/secrets are rejected before storage. No customer/CRM contact lists are read. Automatic sensitive-text detection is conservative but cannot reliably identify every personal name.
- Next HTTP request replays paid planning outputs as DATA, never as new provider calls. It re-runs real public catalogue/selection reads under current rights, preserving anchored dates. Only the existing reviewer is called through current ledger. Three planning calls + one reviewer maximum; same daily$10/100 and cutoff.
- A single SQL compare-and-set claims review. Running, blocked, expired, revoked or other-session work cannot be reclaimed. New unknown outcomes remain blocked; the previous one-attempt exception is unchanged.
- Persist only replay material and verified reviewer receipt for completion. Do not persist result product DTOs, photos, prices, business contact links or full conversation history. User delivery has fresh DTOs. Re-reading a completed result refreshes CRM data and reuses the stored reviewer verdict, with zero provider calls. If current data invalidate referenced cards, validation fails closed rather than paying to replan.
- UI submits the original message once, then polls continuation. Browser session storage keeps only UUID; in-tab state retains the existing draft/transcript. A lost POST acknowledgement is recovered by key lookup, never by retransmitting planning. Cancel stops waiting, not accounting/server work. A manual result-check button uses the same key. Pending/blocked work is not silently replaced with a new key.

## Local evidence

- assistant-continuation-store.cjs runs actual adapter SQL on PGlite: duplicate begin, hash conflict, one claim, immutable/retained candidate, complete receipt not overwritten, same-user different-session isolation, revoked owner denial, blocked no replay.
- assistant-review-continuation.cjs: lifecycle, concurrent callback claim, expiry, unknown block, SQL transitions and RLS.
- assistant-recorded-turn.cjs runs real consultation orchestration/tools/reviewer with synthetic fixtures: two planning responses, later exactly one review, no repeated planning, fresh catalogue reads on resume AND lost-ack recovery, fixed tomorrow/date-only period/size, confirmed empty-results fact, contact/secret rejection, unknown reviewer rejection. It does not demonstrate live model quality or actual latency.
- assistant-continuation-client.cjs: one initial POST, same-key polling, manual lookup after loss, no automatic request retry, mismatched-response rejection.
- Existing 15 dialogue/17calendar fixtures and 11 owner/ledger guard groups remain applicable. Typecheck/lint/build are recorded in the turn report. No live records/calls in these tests.

## Remaining activation gates and risks

Schema approval is still pending. Do not publish UI/route code before the new table/trigger exists: new idempotent requests fail closed if the table is missing. SQL is docs/sql/assistant-review-checkpoint.candidate.sql, revised to keep stored candidates immutable even on completion.

After approval: inspect actual schema; apply only the new additive table/function/trigger; verify RLS/no public access and unchanged existing data; publish exact tested SHA to the existing owner-only Preview; verify READY/alias. Re-read ledger before ONE synthetic live selection. Last known reserve$7.304528, confirmedcost$0.259740,25calls; this is historical until re-read.

No live speed or successful selection is claimed. Provider/DB crash can still leave a running checkpoint with unknown outcome: preserve it and stop, never replay paid work. There is no automatic reconciliation for new unknowns. Storage blocked before the checkpoint commit also fails closed. Polling has a bounded wait; manual check cannot start another model call after claim. No automatic expiry erasure: physical retention needs a separate decision.
