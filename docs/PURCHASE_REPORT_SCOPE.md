# Independent purchase report: implementation and review boundary

Base 8d6dd1e, before execution-policy schema dependency; branch review/crm-purchase-report-export. Release candidate 09c51a7 untouched.

Confirmed gap from CRM_1_0_STATUS matrix and Git history: scoped purchase list/detail and cost permission exist in lib/purchases/queries.ts, but no purchase export route or report. No ledger change needed.

Implemented read-only report page /purchases/report and XLSX endpoint /purchases/export, linked from the purchase list when authorized. Filters: inclusive creation-date calendar days UTC, destination branch and status. Receipt quantities/costs are lifetime receipts for selected purchase documents, not receipt-period activity.

## Exact available indicators

- Purchase number, creation timestamp UTC, status, current supplier/branch names and currency.
- Product/variant/SKU historical snapshots from purchase items; no current catalog eligibility/archive/name filter.
- Ordered quantity, actually received quantity from purchase receipt lines, and arithmetic unreceived quantity. An unreceived quantity on CLOSED/CANCELLED does not imply an obligation to accept more goods.
- With FINANCE_PURCHASE_COST_VIEW: document totalMinor, item unitCostMinor and lineTotalMinor, actual receipt totalAcquisitionCostMinor summed per item. The item line total is the stored document amount, including its allocated additional cost/discounts; unit cost alone does not reconstruct it.
- Counts, quantities, document sums and actual receipt acquisition costs grouped separately by purchase status AND currency. Drafts/cancelled documents are retained in separate groups, not silently treated as completed purchases. No mixed-currency grand total.
- All money is explicitly labelled in minimum monetary units of its own currency. Unsafe-integer bigints remain exact decimal strings in XLSX. No conversion or exchange-rate assumption.

No cash/payment report, margin, revenue recognition, debt, forecast, or expense-recognition indicator is introduced. Document/receipt amounts do not assert that a supplier has been paid. Existing ledger, stock and receipt write paths are untouched.

## Access and bounded reads

PURCHASE_VIEW + REPORT_FINANCE_VIEW are both required. FINANCE_PURCHASE_COST_VIEW gates monetary database selections, DTO values and workbook columns entirely, including explicit DENY overrides. No permission keys or default role grants changed. Tenant identity is checked before reads; accessibleBranchIds refreshes membership/branch scope; optional explicit inaccessible branch is denied.

Three bounded selects share one RepeatableRead transaction: <=5000 documents, <=20000 items, <=100000 receipt lines. Exceeding a bound returns 413 without a truncated workbook. Unknown/duplicate params and invalid dates/status/branch syntax return 400. Inconsistent receipt parent/branch/currency/quantity returns generic 409 rather than misleading totals. All route responses are private/no-store; text columns escape formula starters. No customer contacts/notes or unrelated financial rows selected.

## Verification

- node scripts/purchase-report-mock.cjs: 14/14 PASS. Actual service, actual effective-permission/branch helpers, actual route, XLSX write/load, and React server rendering. Synthetic read-only database mock rejects all unexpected models/writes; no live DB, env-secret loading, external calls or client messages.
- Prisma generate and standalone tsc --noEmit: PASS. Default Next 16.3.3 production build: PASS, 45/45 static-generation tasks, including dynamic /purchases/report and /purchases/export routes. Dummy unreachable loopback DATABASE_URL, blank API/Supabase keys; no migrations.
- Scoped ESLint and git diff --check: PASS (see local verification checkpoint for final run).
- React skill review: native labelled form, server-side permissions and branch scoping, ExcelJS server-only, no hooks/client state/heavy client bundle introduced.

Publication not performed. Base 8d6dd1e retains its pre-existing PILOT-only tenant guard; do not promote this whole branch to Production. For the eventual production package, transfer only this report delta onto the reviewed production base with its own validation/authorization. No operation-policy columns or schema changes required.
