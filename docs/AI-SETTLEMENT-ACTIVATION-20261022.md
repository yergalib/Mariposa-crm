# Approved settlement activation

Both whole-turn preflight and transactional per-call admission share readUsage. One SQL snapshot returns original reservation total and verified receipts for the immutable attempt-created Almaty day; settledDailyDebit recalculates every receipt from its immutable model/tariff/cache/write/output usage and substitutes actual cost only on exact match. Reasoning tokens are included once in output. Invalid/missing/duplicate receipt evidence blocks with503.

No table, reservation, receipt, lease, day, call count or historical exception is modified. Existing per-call admission/receipt persistence organization advisory lock and active-call guard remain. Original reservations remain separately auditable. Legacy and pending/unknown charges remain full. No extra smoke or provider calls.10USD/100 per Almaty day and Oct25cutoff unchanged.

Validation: actual admission SQL plus production projection in PGlite, concurrent settlement+two admissions => one new active attempt, immutable reserves, idempotent settlement, mixed Luna/Sol tariff/cache/reasoning, invalid/duplicate receipt rejection, Almaty boundary. Existing exact retained-unknown SQL/concurrency regression passes.11owner/permission/accounting groups pass; ledger V2migration/immutability regressions, deadline/recorded-turn/admission regressions pass. Typecheck and final lint/build results recorded with release.

Fresh pre-release read:32calls,31verified receipts, historical reservations9.568900USD, confirmed0.3543275USD, retained unknown0.047300USD, charged+reserved0.4016275USD. Zero new unknown. Full ledger digest eb9f20faff6a429e164254483e43b2a7. All31receipts recalculated with production helper. No ledger writes performed.

Limits: internal usage-based cost is not a complete provider invoice; prior21legacy attempts remain uncertain. Full-turn preflight does not escrow future stages: concurrent separate turns can consume capacity between steps, but per-call admission always fails closed. Manual functional selection still needs user testing; this release does not claim end-to-end product availability acceptance.
