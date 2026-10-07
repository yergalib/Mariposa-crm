# P1: product analytics — 2026-10-07

Base: b86d4dd24a00911541b6a78c95e9348f24d4f1ea on review/crm-p1-integration.

## Delivered

`/reports/products`, linked from existing CRM reports, uses the existing report access scope and finance visibility rules. Filters: inclusive UTC dates (same convention as `/reports`, maximum 366 days), accessible branch, rental/sale, model or model/execution/size, product/SKU/size search, quantity/record/name sorting, pagination (50 rows).

Quantity is gross units issued, from RENTAL_ISSUE or SALE_ISSUE movements on their actual posting date. It excludes reservations/drafts; returns are not subtracted. Record count is movement count, not unique order count. Model totals combine sizes/executions. Inventory and catalog permissions remain independent; no stock table is used as historic availability.

Every row opens warehouse movements with the same period, operation type and exact variant or product. The history page, pagination and existing Excel export retain these filters. Existing warehouse tenant/branch/export permission checks remain in place.

The financial section is explicitly all rental or sale orders for the selected period/branches, separated by currency. Product search and grouping do not affect this section. It reuses permitted ledger effect fields and correction visibility, without adding accounting rules. Revenue, cash, deposit and obligation effects remain distinct. Deposits are not revenue.

## Deliberate limits

Per-product money is unavailable: order-level payments and shared discounts do not provide a verified allocation to positions. Utilization percentage and idle days are unavailable: there is no verified full historic fleet denominator. These are labelled unavailable, never estimated from today's stock. Existing quantity-time reports are retained unchanged.

No schema/migration, production change, new ledger, salary, shifts, notifications, or site work in this block. No GitHub push/deployment in this step.

## Evidence

- `node scripts/product-analytics-targeted.cjs`: 6 groups PASS (initial 5, then one focused source-search check): actual workflow tenant/branch scope, UTC inclusive/exclusive boundaries, type separation, grouping/page clamp, currency/reversal effects, permission field omission/report deny/inventory deny, source period and exact variant filters.
- Local Chrome desktop 1440px and mobile emulation 390px: 4 groups PASS; quantities compared with isolated PostgreSQL, exact source history compared with DB, Excel response succeeded, model source link and invalid date handling checked. Audit count/content fingerprint unchanged.
- Browser source: `../verify-p1-product-analytics.cjs`; evidence: `../p1-product-analytics-evidence/browser-result.json`, `browser-search-result.json`, `products-desktop.png`, `products-mobile.png`.
- Browser fixtures were temporary rental issues only, removed in finally. Initial missing fixture and invalid synthetic SALE_ISSUE (required commitment linkage) were test setup failures; no DB constraints were bypassed. Sale aggregation is covered by targeted tests, not claimed as a completed sale workflow browser test. Physical iPhone not tested.
- Final quality result: `../p1-product-analytics-evidence/quality/result.json` (record final outcome below).

Local review URL: http://127.0.0.1:62361/reports/products . Unified P1 runtime uses isolated synthetic database; owner P0 acceptance and production data/photos are untouched. With temporary fixtures removed, an empty quantity table is expected until this synthetic environment has actual issues.

The searched-model edge case was found during final review: source links now retain a separate reportSearch filter, applied identically in warehouse history and export. A focused follow-up browser test parsed the Excel workbook and confirmed exactly the in-period matching issue (prior-day issue excluded). The original final lint/typegen/typecheck/build all passed; because source files changed afterward, changed-file lint, typecheck and build were rerun in the isolated copy (`quality-source-search/result.json`). No full regression or repeated typegen.

Final outcome: initial lint/typegen/typecheck/build PASS; after source-search fix, changed-file lint/typecheck/build PASS. No unresolved implementation blocker for this block.
