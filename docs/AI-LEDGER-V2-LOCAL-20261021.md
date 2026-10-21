# Ledger v2 — LOCAL ONLY / approval pending

## Delivered

- `docs/sql/assistant-provider-ledger-v2.candidate.sql`: complete additive transaction, tested in embedded PostgreSQL (PGlite). Not applied to any shared/live database. The Supabase CLI is absent on this executor, so this is a reviewable SQL candidate, not a fabricated CLI migration-history entry. Register it with the normal migration workflow after approval; do not install tooling or apply it implicitly.
- Eight nullable columns only on `assistant_provider_attempts`: model, pricing_version, call_kind, reserved_nano, usage_state, actual_usage, actual_cost_nano, provider_response_id. Existing rows remain entirely null in these fields. No backfill or business data changes.
- A shape constraint, unique response-receipt index and SECURITY INVOKER update trigger preserve attempt identity/model/tariff/reserve and verified receipts. No grants, RLS, roles, auth or public routes added.
- Shared budget query for full-turn admission and per-call transactional admission sums each persisted reserve. Both still enforce existing MAIN owner, time window, Almaty day, $2/100 and advisory lock. Full-turn preflight is still USD 1.155836. Actual usage never reduces the daily reserve.
- Registry of immutable approved tariff versions. On reservation, store the chosen model/version/reserve before provider access. On verified completion, compute exact nano-dollar estimate from validated token breakdown and captured tariff, persist only numeric usage plus response ID, then close lease atomically. No chat text, keys or personal data in the receipt. Output reasoning tokens are already included in output tokens and are not charged twice.
- Re-saving the exact same completion receipt is idempotent. A conflicting receipt fails; a response ID cannot settle two attempts. No automatic provider retry or client-supplied attempt identifier introduced. This is settlement idempotency, not a new HTTP conversation-retry feature.

## Legacy policy (explicitly unresolved provenance)

Legacy records have no authoritative per-call model, price or usage. They retain a **fixed uncertainty allowance**, 0.369512 for non-review and 0.047300 for cap-300, equal to the currently deployed conservative debit. This is not a Sol model backfill. The 21 existing calls remain USD 6.148692 for daily admission; today's block is not lifted. No discount is inferred from timestamp, input_bytes, current model or a closed lease.

Old unknown leases retain existing protection. New usage_state='reserved' remains blocking even if its lease timestamp becomes past, including across midnight. Daily totals use Asia/Almaty and retain all prior rows. Future model switches cannot revalue proven new rows. Any legacy reconciliation requires authoritative evidence and a separately approved data change; this package does not perform it.

## Deployment ordering after approval (not performed)

1. Read-only preflight table shape/counts/active leases and exact code target; retain evidence. Do not run SQL if preconditions differ.
2. Apply the reviewed additive SQL transaction through the existing authorized migration workflow. Re-read columns/constraint/index/trigger/RLS and verify all original row values and counts unchanged. No model calls needed.
3. Release the matching code only after migration success. Deploying v2 before columns exist fails closed; do not use that as a test.
4. Verify exact Preview SHA/READY/alias, owner-only guards and read-only budget. No new smoke or calls are authorized by this preparation.

## Rollback without destructive down

- Before SQL commit: transaction rollback leaves old schema/rows unchanged.
- After additive SQL: retain columns, receipts, constraints and index. Do not DROP or erase data to roll back code.
- Prefer a forward code fix while retaining the same budget reducer. Do not roll back to a legacy cheaper-model counter that ignores persisted reservations.
- If provider operation must stop, fail closed through the existing assistant gate with separately authorized operational configuration; keep catalog and business workflows available. This document is not permission to change env now.
- Unknown outcomes remain reserved. If an acknowledgement is lost, only re-save the identical receipt; never repeat the OpenAI request to reconstruct usage.

## Verification scope

- `assistant-owner-day-targeted.cjs`: 11 groups PASS, including concurrent reservation exclusion, mixed-model sums through actual budget code with in-memory DB transport, idempotent/conflicting receipt, missing/incomplete/model-mismatch usage, Almaty day boundaries, legacy and new unknown leases, unchanged owner/tenant/permission checks.
- `assistant-ledger-v2-sql.cjs`: 5 groups PASS using actual PostgreSQL SQL in PGlite memory: additive preservation/RLS, trigger immutability, atomic/idempotent settlement, duplicate provider response rejection, mixed-model/legacy arithmetic, midnight retention, migration replay atomic failure.
- Sol policy and 13-turn/11-calendar offline orchestration regressions PASS. These do not establish live Sol availability or response quality.
- No live DB writes, paid calls, env changes, push or deployment in this task.

Final verification: typecheck PASS; isolated Next build PASS with zero network attempts; lint PASS (0 errors, 7 pre-existing warnings).
Prisma schema validation PASS using synthetic loopback URL. Initial sandbox jiti-cache EPERM resolved by the approved local validation retry; no database connection/migration. SQL lock timeout 5s and statement timeout 30s, transaction abort on failure.
