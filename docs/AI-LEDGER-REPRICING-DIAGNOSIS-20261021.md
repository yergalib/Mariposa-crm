# Ledger repricing diagnosis — 2026-10-21

Status: confirmed accounting limitation/regression on model switch; no runtime change, no database write, no publication, no provider call. The current fail-closed block remains. Sol API availability is NOT verified.

## Read-only database evidence

The live `assistant_provider_attempts` table has exactly eight columns: id, organization_id, membership_id, created_at, lease_until, input_bytes, output_token_cap. No persisted model, pricing version, monetary reservation, actual usage, actual cost, provider request id or response id. A search of assistant tables' column names found no separate usage/model/cost/pricing/token columns.

Exact owner + MAIN scope, Almaty 2026-10-21:
- 1 attempt cap 64 at 03:19:08.958 UTC, input bytes 510.
- 5 attempts cap 300, 03:21:45.396–06:46:52.561 UTC, input bytes 4175–4584.
- 15 attempts cap 1400, 03:21:41.105–06:47:56.419 UTC, input bytes 19028–20950.
- 0 active/unknown leases according to the existing predicate.

These timestamps precede the Sol deployment. Deployment history and previous source support that these were Luna-era requests, but an individual ledger row does not attest its model/tariff or provider token usage. Input bytes and output cap are bounds, not billed tokens.

## Confirmed code cause

`provider-budget.ts` calculates historical monetary totals from counts multiplied by **current** `ownerTestPolicy()` rates. The old version at 3e8eb858 charged all 21 rows at the flat Luna reservation 0.018475600: USD 0.387987600. That number is a reconstruction of the former guard, not persisted actual spend.

The Sol patch at be9f824 charges 16 non-review rows (including the historic smoke) at 0.369512 and 5 cap-300 rows at 0.047300: USD 6.148692. The 20x model tariff change revalues historical rows. The introduction of a distinct review reservation also means the new formula is not simply 20x the old flat total. Neither amount is an invoice. No new provider usage explains the difference.

`provider.ts` validates returned usage, then only writes lease_until=now(). The verified token counts are discarded from durable accounting. The new usage-summary is returned in owner-only response evaluation metadata but is not persisted or used to settle the ledger. A released lease indicates the application's completion check passed; it does not preserve the cost needed for audited repricing. Unknown requests retain their lease and remain blocked across day boundaries.

## Decision

Do not lower the live reserve by guessing model from timestamps, using current deployment as a proxy for per-request provenance, assigning a discount from input_bytes, or assuming released means free. No row edits, refunds, resets, counters deleted, cap increases or additional calls. The block is justified as a fail-closed response to missing provenance, NOT as proof USD 6.148692 was spent. Midnight only starts another daily window; it does not repair mixed-model accounting.

## Minimal proposed durable repair (not implemented / not approved migration)

1. Add nullable provenance fields for legacy rows and required fields for new reservations: model, immutable pricing_version, call_kind, reserved_nano, usage_state. Persist verified provider usage and computed cost with its pricing version; preserve request identity for reconciliation without chat text, credentials or customer data.
2. Before sending a request, in the existing membership check + organization advisory-lock transaction, persist the exact selected model/tariff and immutable worst-case reserve. Sum each new row's own reserved_nano, never reprice it from the current model. Both turn admission and per-call admission use the same reducer. Keep full-turn reservation and existing limits unchanged.
3. Completion atomically records verified usage and closes the lease. For this bounded test, retain the original reserve for daily admission even after completion; actual cost is reporting only. Thus persistence does not introduce an unapproved refund policy.
4. Legacy rows remain explicitly unknown. Do not backfill a model/tariff without authoritative per-attempt evidence. Retain the present conservative charge/block for unresolved legacy usage. A separate reconciled mapping would require supported evidence and approval before data writes.
5. Required regression matrix: mixed Luna/Sol immutable sums; changing current tariff cannot revalue existing proven rows; legacy/null provenance cannot be discounted; unknown/active usage survives Almaty midnight; daily count and costs switch at 19:00 UTC without deleting history; transaction races cannot overspend; malformed usage cannot release lease; historical smoke remains counted and cannot rerun.

No live schema change is authorized by this diagnostic request. Existing day-boundary/unknown-lease/owner permission suite is rerun separately; it does not prove mixed-model correctness, which the current schema cannot express.

Verification: node scripts/assistant-owner-day-targeted.cjs PASS (10 groups), zero real or scripted provider calls. Runtime code unchanged; build not repeated for a documentation-only diagnostic.
