# Assistant candidate: remaining acceptance, 18 October 2026

**Follow-up:** the blanket malformed-review failure described below is superseded by [the verified-data fallback checkpoint](ASSISTANT_REVIEWER_FALLBACK_20261018.md). The historical review and four live checks remain evidence limits, not new live results.

This is a reconciliation of the existing full16 and critical3 reviews, not a new audit or live-model run. Candidate before this checkpoint: `b72ac23b7579731287f3b4e3f4ca90ac48535d8e`; comparison fix `7bc998477ec64896d1d39d95f7cd1785c25890b0` is already included. No application code needed duplicating in this pass.

## Concrete remaining defects and evidence limits

1. **Malformed reviewer output still prevents task completion.** A successful CRM read followed by an invalid semantic verdict deliberately returns clarification with no cards. The exact historical malformed raw responses were not retained, so their syntax cause remains unknown. This is an unresolved reliability limitation, not a claimed PASS. Weakening parsing or publishing unreviewed prose/preferences is not a safe fix. A new offline regression explicitly preserves this boundary instead of reporting recovery success.
2. **Comparison UI PARTIAL is locally closed, live acceptance remains.** The actual component from 7bc9984 renders both recorded catalogue prices, sizes and colours; missing prices remain unknown, date availability remains unchecked. Current SSR regression passes. Existing browser evidence at `evidence/isolated-preview-runtime-20261017/comparison-{390,430,1440}.png` covers actual components and no horizontal overflow; the 390 image was inspected again. These are synthetic fixtures, not a new live-model acceptance result.
3. **Remaining historical failures have local fixes but incomplete live confirmation.** No additional application defect was reproduced in the targeted suites. In particular, a transient read failure does not poison the next turn: the new recovery regression retains dates, height and criteria and renders a freshly verified card even when all model prose is rejected by a valid verdict. This does not cover an invalid verdict (item 1).

## Reconciliation of the sixteen recorded scenarios

| Scenario | Existing evidence / current disposition |
| --- | --- |
| colour-cheaper | critical3 PASS; not changed |
| colour-replacement | full16 PASS; not changed |
| size-correction | full16 PASS; not changed |
| date-correction | full16 PASS; not changed |
| size-and-colour | explicit corrections retained offline; malformed-verdict task completion remains limited |
| empty-catalog | successful empty result explained offline; malformed-verdict path remains limited |
| saved-products | critical3 API/ranking passed; UI fix verified offline and existing browser evidence; live UI acceptance outstanding |
| human-handoff | critical3 unsent draft passed; separate hosted Pilot receipt/retry/staff-view evidence passed; no rewrite |
| booking-not-confirmed | critical3 deterministic limitation passed; not an LLM-quality result |
| tool-injection | full16 PASS in observed synthetic scope; no general safety claim |
| recover-tool-error | new offline next-turn recovery passes; malformed-verdict recovery still fails closed |
| unknown-price | full16 PASS; current comparison missing-price regression passes |
| comfort-unknown | full16 PASS; no fit guarantee introduced |
| budget-change | bounded empty cheaper-result explanation passes offline; live confirmation outstanding |
| negative-then-positive | preserving a different positive colour passes offline; live confirmation outstanding |
| unknown-hours | full16 PASS; no hours invented |

## Small remaining live acceptance set (not run or authorized by this document)

- Saved-products comparison: two displayed catalogue prices and the cheaper selected product, retaining size/dates and unknown availability.
- One explicit size+colour correction through reviewer, followed by an empty result/budget constraint; inspect actual review parsing and retained context.
- Transient read failure followed by successful recovery; separately assess any malformed verdict without labelling fallback as success.
- Negative-colour exclusion followed by positive replacement, retaining other preferences.

Real unavailable inventory is still outside fixture evidence. Hosted Pilot window deadline elapsed according to the database; application HTTP expiry enforcement remains unverified behind the restored WAF. Neither requires reopening WAF or creating records in this stage.

## Validation and scope

Current targeted runs: comparison presentation PASS (4 checks), full-run regression PASS (12 reported groups, including recovery and malformed-review boundary), evaluation regression PASS (10 groups), independent boundaries PASS (14 negative/ambiguous colours, 3 positive controls, 8 ID/tenant cases). All offline; zero paid calls and remote writes. Final build/lint/typecheck results are recorded in the adjacent JSON evidence.

Budget unchanged: **252 attempts; $4.6558512 reserved; $0.3441488 unreserved of $5**. No paid calls, key access, budget-ledger modifications, publication, WAF changes or new hosted test in this stage. Historical paid-run counts are reused, not a fresh provider billing query.
