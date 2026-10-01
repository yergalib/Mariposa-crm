# Strict colour selection — 2026-10-01

Fixes the report that asking for yellow returned pink/white/champagne.

- The consultation colour field is a real filter, not an ignored wish. One supported
  colour is required in the UI; `любой` explicitly means no colour restriction.
- Server catalog selection normalizes case, ё/е and supported adjective inflections.
  White, milk, ivory, champagne, yellow and gold remain distinct. Unknown/ambiguous
  colour fields fail with clarification; no automatic replacement by another colour.
- Supported colour mentions in wishes/model search are reconciled with the separate
  field. Conflicts/negations/multiple colours require clarification. Known unsupported
  shade names also require clarification. This is bounded vocabulary, not general NLU.
  Free wishes are not transmitted to the read-only API; only resolved colour/name are.
- Eligible size/model candidates are read with tenant/publication guards, max 1000.
  Confirmed colour filtering happens BEFORE SQL group pagination and availability.
  Evidence is a conservative colour description in execution.name; with no execution,
  Product.color is used. Unknown execution descriptors are excluded, not guessed from
  a photo or arbitrary model name. Mixed explicit colour descriptions can match any
  included colour; the UI states this. Recheck colour before returning loaded rows.
- Empty results contain the applied colour. Other colours appear only after the user
  presses `Да, рассмотреть другие цвета`; size, branch, dates and remaining model query
  are unchanged. The result and inquiry wishes record that explicit broadening.
- Applied colour is visible above the results; explanations cite only verified colour
  and size. Availability on dates still uses the shared CRM service and needs staff
  confirmation. Occasion and budget are explicitly labelled wishes, not filters.

No DB/schema/publication/provider changes. Existing price/compatibility gaps remain.
Regression script `showroom-color-smoke.cjs` runs actual service/normalizer/UI handlers
with mocked DB/fetch: yellow no-match, ё/е/case/inflections, positive metadata matches,
unknown/negative/conflicting colour rejection, pagination filtering and explicit-only
broadening retaining other criteria. Existing targeted regressions also run.
Browser checks remain subject to the existing access restriction; not bypassed.
