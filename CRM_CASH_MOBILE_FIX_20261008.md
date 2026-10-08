# Cash mobile clipping correction

Follow-up to UI candidate b77bc2fa and regression closure e08d47b5, on the same review/crm-p1-integration branch. This supersedes the earlier cash/payroll screenshots. Candidate remains local and unpushed; no draft PR or Production publication.

## Change

- At 390px the cash journal uses compact two-column rows: operation/date and signed amount at the top, linked customer/short order below, payment method and adjacent Details action. Every amount/action stays visible without horizontal scrolling. Desktop retains the table.
- Long order references are compact display labels in the cash journal, financial journal and account history. Full linked order references and selectable operation IDs remain in details. Links continue to use complete IDs; no query or finance behavior changes.
- Payroll employee selection previously expanded the viewport to 449px. Mobile filters now use one column, bounded selects and a compact checkbox. Role headings wrap safely.
- Only the isolated synthetic database crm_ux_refresh_1791439387184 received readable fictional Russian customer/user/payment-method/order/role labels. No live organization, MAIN/Pilot, photo, password or financial entry was modified. Role names changed only for screenshots; permission keys and membership assignments were not changed.

## Verification

Targeted ESLint passed for all three edited pages and the compact reference helper. One final Next.js webpack build passed: 89.732s total, compilation 36.2s, TypeScript 35.7s, 66 static pages. No extra standalone typecheck or full regression run was repeated; prior 15/15 mock regression remains recorded separately.

Six targeted browser checks passed on the final built candidate, with separate headless Chrome and synthetic auth sessions that were removed afterward:

1. Every cash row at 390px exposes operation, amount and Details within the viewport; row layout is grid, document width is 390px.
2. Cash details retain the full selectable operation ID, customer/order links and existing correction availability.
3. Actual selected-employee payroll data, controls and amounts fit 390px; the test explicitly requires the employee and ledger sections, rather than accepting an error page.
4. Role assignments and expanded permission categories in an open role dialog fit 390px.
5. Payroll rate dialog and opened bonus/payout forms fit 390px; no forms were submitted.
6. A temporary legacy-style long CA order number is compact in desktop/mobile rows and remains complete in linked details; its readable fixture number was restored in finally.

Before/after fingerprints of all financial transactions and all role permission-key sets are identical. Source/build hashes match for all six changed presentation files. Foreign next-env.d.ts changes are unchanged. Original local CRM login on 62369 and built review login on 62380 both return 200. Physical iPhone was not tested.

Workspace evidence: ux-cash-review-evidence/{browser-result.json,build-result.json,final-invariants.json,library-replacements.json}; browser scripts verify-cash-built-review.cjs and probe-cash-mobile-details.cjs are outside the application checkout and contain only synthetic local connection settings.

## Updated Library images

All eight replacements succeeded with the original IDs and a version-0 concurrency guard; each is now version 1. No new Library items were created. Windows local xattrs are unsupported; identity/version/local path records remain saved as JSON.

| Screen | Desktop library_file_id | Mobile library_file_id |
|---|---|---|
| Main | libfile_92801bdb6ae481919b8dc41b3c5b46f3 | libfile_6366837f583c8191ac229a58171abce8 |
| Cash | libfile_66a51e7a3a708191be7860955cd8c5c4 | libfile_cf30bfb964188191893bdc534f6af89f |
| Payroll | libfile_6a8fc4fbd3b48191a785f7a6433999e3 | libfile_cc57932df73c8191b7b1eb0370f67c0e |
| Permissions | libfile_6177cc2faf5c8191b4fd0a5bd551a2b2 | libfile_fbd6b0a61f588191a49e237c190f54c8 |

The review server on 62380 uses the final build in ux-cash-review-build. Original 62369 and shared PostgreSQL 62317 remain running. Production, Vercel, live schema/data/Storage, business permissions and ledger logic are untouched. No release blocker was found for this visual correction; owner visual acceptance and any Production publication remain separate decisions.
