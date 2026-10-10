# Independent review fixes for 5bc75e6 — 2026-10-09

All three reported defects were reproduced or confirmed in source and corrected locally. No paid calls, live enablement, access-gate changes, environment files, schema, photographs, audit files, push or deployment are involved.

## 1. Search continuation

The conversational search retains result.next in context.nextSearch. Its identity covers branch/timezone, period, slot, effective category, size and colour. A note-only clarification, explicit card selection and removal preserve the cursor. A changed query invalidates it before a read. The existing "Ещё варианты" action consumes that cursor deterministically without a model request; more_dresses lets a natural-language turn consume the same cursor. Neither exhausted nor invalid cursors silently restart the first page.

Seen variant IDs are carried with the cursor and removed from subsequent results, including overlap across changing CRM pages. The set is bounded: once it reaches 64 IDs no further continuation cursor is offered. This is bounded local pagination, not a claim to scan the whole catalogue. The cheaper-than tool deliberately does not expose a plain-search cursor, since that cursor would lose its price constraint.

Regression: first page offset 0 returns variants 200/201/202; same page offset 3 returns 203; page 2 contains a repeated 202 plus 204/205, and only 204/205 are returned. After exhaustion, a further action does not query page 1. Date/size/colour changes invalidate continuation; note updates and tab-state roundtrip preserve it. PublicCatalog receives page only; the existing runner consumes offset when slicing that page.

## 2. Product options become readable candidates

After a successful public get_product whose returned product/execution matches the requested reference, only its validated UUID option IDs are added to the turn's known set. read_variant can then request a returned option. It still calls the existing public selection path, which rechecks tenant, branch, dates and publication. This grants no booking or write authority and does not trust model-invented IDs.

Regression: product -> its option -> fresh variant card succeeds. An option from another unreturned product never reaches select. Failed product reads grant no IDs. A variant unpublished after the product read fails its fresh select.

## 3. Realistic sequential tool contract

Model calls remain capped at three and parallel_tool_calls remains false. Server rejects more than one function_call in a model response. Normal fixtures now assert that wire shape; intentionally invalid fixtures separately test rejection.

One read_batch function accepts one to four strictly typed read-only operations and executes them sequentially under the existing eight-runner-read budget. No nested batch, preference mutation, write or arbitrary tool name is admitted. Each member retains the ordinary product-reference/known-variant/public/tenant checks. A failed member returns a sanitised unknown result; successful sibling reads remain usable.

Four-product comparison uses batch get_product x4, optional batch read_variant x4, then final. A colour correction plus search plus rules uses remember_preferences, then a two-member read_batch, then final. The model has two tool rounds, not four sequential rounds. Batch JSON Schema uses supported anyOf/enum forms; the local Zod discriminatedUnion's oneOf output was avoided. No new model allowance was added.

## Live smoke remains blocked

The existing one-shot limiter is intentionally unchanged. It rejects tools, multi-message transcripts and output 1400. It must not be bypassed to test this candidate. The 48 KB request bound is a payload guard, NOT an input-token or dollar limit.

A future adapter must reuse the same atomic approval ledger and total-attempt reservation; count the exact immutable full request (history, tool definitions, tool results, structured-output schema and instructions) before every generation; reserve verified worst-case input/cache-write/output/reasoning charges without refund after uncertainty; and keep zero retries. Three model steps would already consume all six provider HTTP attempts as three count/generate pairs. Output 1400, supported tool whitelist, fresh prices, preflight billing and complete usage accounting need review before the existing runner could accept this shape. None of that live adapter is enabled or claimed tested here. The safe executor, existing key/project association and obsolete access-gate branch remain separate blockers requiring confirmation.

## Evidence

PASS: targeted review regressions, realistic conversational scenarios, read-tool boundaries, tab-state compatibility, typecheck and scoped lint. Read-tools/tab-state/typecheck evidence: C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-consultation-review-15SKYK. Definitive final-candidate review/conversation/lint/build results and matching source-sha256.json: C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-review-final-zIEFfm. results.json records each exit. The final build includes TypeScript and uses the established allowlisted child process with synthetic loopback DATABASE_URL and no .env changes. This is not a live database check or production E2E.

Real model calls: zero. Scripted scenarios establish control-flow and guard behavior, not real-language comprehension, answer quality or universal injection resistance.
