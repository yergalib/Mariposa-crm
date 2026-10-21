# Showroom purchase candidate, 2026-10-21

Base: `9cb33a263bff4537901f5ec62b4f4ae3eb127622`. Isolated branch: `local/showroom-purchase`.

The existing showroom now has rental/purchase navigation. Purchase queries use the existing published SALE operation policy, valid SALE prices for the selected branch (then organization price), and existing permanent fleet reduction availability. No rental price fallback. Photo authorization follows the selected operation. Tenant, owner-day and inquiry gates are unchanged.

The purchase detail has no rental dates. It verifies the selected size/branch before enabling an inquiry. Missing price or unavailable stock prevents submission. Changing selection cancels/invalidates prior checks. The server independently revalidates eligibility, price and capacity.

Purchase requests use the existing WEBSITE Inquiry pipeline, audit and idempotency lock. The subject explicitly says purchase, the text records SALE, quantity one and server price/currency, and existing item snapshots retain variant/SKU/size. Requested rental dates are null. There is no new database enum/schema, payment, order, commitment, reservation or inventory write. Staff must confirm and process a sale separately in existing CRM. This candidate does not add a structured purchase filter to CRM; purchase is explicit in subject/text.

## Verified

- `node scripts/showroom-purchase-targeted.cjs`: 7 groups pass, actual service/schema code with allowlisted in-memory dependencies. Strict payload; rental/fitting compatibility; SALE/rental prices; unchanged identity; owner/branch/eligibility; no price/stock; price conflict; concurrent duplicate key creates one mock inquiry; retry remains idempotent after price changes.
- `node scripts/showroom-date-only-targeted.cjs`: 32 cases pass.
- `node scripts/showroom-browse-photos-targeted.cjs`: pass.
- `node scripts/showroom-catalog-final-regression.cjs`: pass.
- `node scripts/verify-showroom-purchase-local.cjs`: typecheck, lint and Next webpack build pass. Synthetic allowlisted environment; network/DB connections blocked. Initial sandbox mkdir EPERM resolved by approved local execution.
- Browser on `http://127.0.0.1:8876/showroom`, real React components with mocked data/requests: switch both ways, separate prices, purchase without date inputs, unavailable price/stock disabled, double click emits one mock POST, success, change selection, browser Back, rental date requirement. Mobile viewport 390x844: document client/scroll widths both 375, no horizontal overflow. Desktop visually checked. Fixture prices/assets explicitly examples, not assertions about a live SKU.

## Deliverables / remaining release work

Fixture: `node scripts/showroom-purchase-fixture.cjs`. Localhost only; no external submissions.

Library screenshots:
- catalog `libfile_817ae39adf1c819195fe1854378d8cb8`
- desktop `libfile_a8773888f9a48191a3ef8e7f29fcd22b`
- mobile `libfile_8e2c9070a19c8191b5ae4ba94bd40113`

No push/deploy, live CRM query/write, real inquiry or AI call was performed. Live sale SKU/price coverage and persistence into the hosted CRM are not yet verified. Integration target supplied by parent is `805dcbf31b417f2f516a87cf18296848e1ac85ca`; transfer this candidate there and rerun checks. Hosted release remains separately blocked by the previously reported Vercel 403; this task did not retry or bypass it. No business decision blocks the requested inquiry-only sale flow.
