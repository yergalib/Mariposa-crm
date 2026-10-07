# P1 inquiry funnel — 2026-10-07

Base: 7f3125758444a224ba29b5282edb614e34037254, review/crm-p1-integration.

## Scope and semantics

New `/reports/funnel`, linked from existing CRM reports, reuses Inquiry.orderId, Fitting.inquiryId and Fitting.orderId. No schema, events, conversion engine or accounting changes.

Cohort: inquiries created within inclusive UTC dates, matching existing reports' date convention (up to 366 days), scoped by tenant, accessible branch and optional Inquiry source. Snapshot: current saved links as of report generation, including linked records created after the cohort period. A repeatable-read transaction keeps the read consistent. This is not a historical snapshot at period end, and cohorts have different observation lengths.

Counts: cohort inquiries, inquiries with fitting records, inquiries with accessible order links, inquiries with an order explicitly linked through a fitting, fitting record count, globally deduplicated linked order count. Direct and fitting order references are deduplicated per inquiry. Ratios use the same cohort; the through-fitting denominator is cohort inquiries with a fitting. No inference from current status, customer identity, contact details or unrelated old orders. Cancelled records still represent saved links; fitting does not mean attended and order does not mean paid.

Detail rows link to existing inquiry, fitting and order screens. Filters/pagination retain cohort parameters. At more than 5000 inquiries, a clear unavailable state asks for a narrower filter rather than silently returning partial totals.

## Access and data limitations

Existing REPORT_FINANCE_VIEW, LEAD_VIEW, FITTING_VIEW and ORDER_VIEW are required, with actual membership role OWNER or DIRECTOR. Tenant/branch checks apply separately to all linked entities; no financial fields are selected. Seller cannot access this report. A missing required permission blocks the report rather than exposing partial analytics as zeros.

Only currently saved accessible links count. Missing links do not prove a lost customer. Historical linking timestamps, prior source values, time to conversion and past-date funnel reconstruction are unavailable. Inquiry source is mandatory with CRM default; an originally missing source cannot be distinguished from a confirmed in-store source. OTHER stays separate. No speculative attribution, LTV or revenue allocation.

## Verification

- `node scripts/inquiry-funnel-targeted.cjs`: 5/5 groups PASS. UTC inclusive/exclusive boundary and source filters; actual workflow permission and tenant/branch checks; later related records, deduplication and no status inference; inaccessible objects; empty/capped cohort and pagination.
- `../verify-p1-funnel.cjs`: 3 browser groups PASS, desktop 1440px and mobile emulation 390px; one inquiry/two later fittings/one shared direct order; source links; empty-cohort unavailable conversion; seller denied; audit count/content fingerprint unchanged.
- Temporary records used only the isolated P1 synthetic database and were removed in finally. Early fixture setup failures (required inquiry author, 30-minute fitting duration) were corrected; DB constraints were not bypassed. Physical iPhone not tested.
- Screenshots and browser result: `../p1-funnel-evidence/`.
- Final isolated lint/typegen/typecheck/build: `../p1-funnel-evidence/quality/result.json`.

Local review: http://127.0.0.1:62361/reports/funnel . Production/P0 acceptance data, photos, auth, environment and migrations untouched. No push/deploy. Existing next-env.d.ts local modification excluded from commit.

Final result: lint/typegen/typecheck/build PASS on first final run. No unresolved implementation blocker for this block.
