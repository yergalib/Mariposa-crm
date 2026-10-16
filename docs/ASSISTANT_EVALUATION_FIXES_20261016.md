# Local evaluation follow-up

Follow-up: the isolated compilation blocker below was subsequently closed using the established synthetic loopback configuration and a child network guard. See `ASSISTANT_INDEPENDENT_CLOSURE_20261016.md`; real database integration remains unverified.

No API requests, credentials, production services, migrations or budget resets in this follow-up. Original evaluation files and all reservations remain untouched.

## Evidence limits and reproduced causes

The paid run saved only counts for rejected final card/product references. `colour-replacement/trace.json` records one successful search card, one final card reference, then `CARD_NOT_VERIFIED`; the actual final ID was not saved. Exact attribution of that live failure to a product ID, unknown ID or invalidated card is therefore impossible from retained evidence. The same limitation applies to `size-correction` and its product reference. Do not label a hypothesis as a recovered live response.

Offline tests reproduce both error classes with the actual runtime and synthetic public service: product ID in `cardIds` is rejected; a search result used as `productRefs` without `get_product` is rejected. Those checks remain strict. Cards now expose an explicit `cardId`/`variantId`, the final schema describes which ID to copy, and `get_product` has a UUID/default-execution schema instead of arbitrary strings. This reduces contract ambiguity; its effect on live model behavior is unconfirmed.

A separate concrete runtime defect was reproduced: `get_product` → `remember_preferences(activeSlot)` → final reference to that successfully read product failed with `Сравнение нужно уточнить.` because every preference update cleared the products map. Restoring that old unconditional clear in memory makes the regression fail at the comparison assertion (exit 1); the fixed implementation passes (exit 0). Only changes to dates or search criteria now clear these reads. Unknown/unreferenced products and stale cards after a size change still fail.

The retained colour-cheaper transcript shows a positive colour staged successfully, an invalid reviewer decision, then a reply with the original white context. A narrow deterministic grammar now accepts direct, unambiguous colour commands such as the exact saved `Лучше синее, остальные пожелания и даты те же. Есть вариант дешевле первого?`. That user-authored correction survives a malformed review while cards and prose still fail closed. Dates, size, height and notes remain intact. Negations, questions, conditionals, multiple colours and another garment slot are not inferred. Other phrasings still depend on the existing preference review; this is not unrestricted natural-language extraction.

Safe evaluation traces now classify reference provenance (variant, product-in-card-field, unseen) and reviewer completion/token/parse status without saving raw model text or IDs. These classifications are diagnostic only; they do not authorize a reference.

## Strict retrospective assessment

`assistant-evaluation-rescore-20261016.json` was generated from the original saved replies, not from a new model run. Main 24: **21 FAIL, 3 REVIEW_REQUIRED, 0 automatically confirmed PASS**. Two rechecks: **2 FAIL**. The three remaining cases are any-colour, catalog-error and cancel-request. Manual reading found these useful, but automatic checks deliberately cannot certify full semantic success.

Safety checks have a separate status. Missing second turns, generic refusal in either turn, missing comparison continuation, silence about an empty result and repeated known-preference questions cannot count as successful dialogue. `CHECKS_PASS` covers only the named safety assertions, not proof of every safety property. Historical 11/15 labels remain in their original evidence for provenance.

## Verification

- `node scripts/assistant-evaluation-regression.cjs`: actual runtime, synthetic tools and scripted responses; network modules forbidden. Ten regression checks pass.
- `node scripts/assistant-evaluation-test.cjs`: offline budget/orchestration checks pass, including prior reservations, exclusive start and call/turn limits.
- `node scripts/assistant-manager-targeted.cjs`: eight existing integration checks pass, including cross-tenant rejection, no height-to-size inference and reviewed prose.
- `node scripts/assistant-cache-usage-offline.cjs`: 5 accepted / 16 rejected usage cases pass after renaming a local loader variable to resolve an existing lint error; no budget logic changed.
- `npm run typecheck`: pass. `npm run lint`: no errors, seven existing warnings in unrelated UI files.
- Build is **not fully verified** in this environment. Sandbox build first failed Windows canonicalization with `os error 5`. Unsandboxed Turbopack rejected the existing external `node_modules` link. `npm run build -- --webpack` compiled successfully (27.9s), passed its TypeScript stage (8.7s), then failed page-data collection for `/finance/export` and `/api/v1/rental/branches`: `DATABASE_URL is required`. No database URL or environment configuration was supplied or changed.

The live session has ended. Remaining confirmation requires an authorized future live run with the improved diagnostics: precise rejected-ID causes, the effect of clearer tool schemas, broader colour corrections, useful empty/unavailable replies, comparison follow-up and the flows that never reached their second turn (handoff, booking, injection, date/size correction). No additional key prompt or live run was opened here.
