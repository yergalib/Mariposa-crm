# Sale technical handover sheet

Successor to UI candidate `8628df12a8b327ced9641b2887b31185ae33d77c`; separate local document change, not permission to publish either candidate.

The sale card now links to `/orders/[id]/sale-print`. The unsigned technical sheet reads existing order items, sale commitments and actual negative `SALE_ISSUE` movements. Assigned instances and order status are never treated as proof of issue. BULK movements across locations are summed; serialized identifiers appear only with actual movements. Planned, issued and remaining quantities are distinct, including partial issue. Removed lines retain their historical facts and have no pending issue claim.

This is a current operational view, not an immutable snapshot. The page states that subsequent printing can differ. No new tables, migrations, financial fields, payment claims, legal terms, signatures, handover operations or ledger writes. Existing rental print and immutable V1/V2 documents are untouched.

`getSalePrint` performs a read-only repeatable-read transaction with fresh `workflowScope(..., ["ORDER_VIEW"])`, active organization/branch and tenant scope. The route additionally requires authenticated `/orders` access and `ORDER_VIEW`. Projection excludes all money and contact fields.

Validation: targeted service and server-rendered page tests cover BULK partial quantities, serialized assignment versus actual issue, escaped text, no financial projection, tenant/branch/type isolation, revoked permission and inactive membership. Mock client exposes no mutation methods and fixture contents remain unchanged. Targeted ESLint passed. Chrome checks of isolated server-rendered HTML passed at desktop 1440 and mobile 390 pixels without horizontal overflow; print controls disappear under print media and PDF generation succeeded (68,955 bytes).

Browser evidence: workspace `sale-print-layout-evidence/result.json` and `sale-print.pdf`. This is a static route-render fixture, not an authenticated browser HTTP journey. Physical printer/iPhone not tested. No production data or publication involved.

The existing checkout dependency junction lacks `@vercel/functions/db-connections`, so its direct typecheck reports that pre-existing missing dependency. An isolated source copy with the existing exact UI build dependencies is used for final build/type validation; no environment files or live database connection are copied.

Final isolated Next.js 16.3.3 webpack build: PASS, including TypeScript and generation of 66 static pages. Dynamic sale-print route included. DATABASE_URL used offline localhost port 1; no env files copied.

## Authenticated HTTP follow-up

The missing dependency was a setup mismatch: this checkout's `node_modules` junction pointed to the older shared `mariposa-crm/node_modules`, which has no `@vercel/functions`; the current lockfile requires 3.9.11. A separate dependency directory was restored with `npm ci --ignore-scripts --registry=https://registry.npmjs.org --no-audit --no-fund`, then only this checkout's junction was repointed. No versions or lockfiles changed, no install scripts ran, and shared dependencies were not modified. Final direct checkout `tsc --noEmit`: PASS. Foreign `next-env.d.ts` retained SHA-256 `b8b3a344484b959af5e4e3fc1a1609dac3cb9ece0cdeb6c145be29bc4c491000`.

Real server on localhost port 62387 tested implementation SHA `2f0c544389715d4bec19b14a14a022cfe168a141`; runtime source parity verified. The isolated database `crm_sale_http_1791452506985` is a clone of an already-marked synthetic fixture, excludes existing auth sessions and contains four newly-created SELLER test accounts. No OWNER session or live database was used. Fixture creation obeyed the existing DB constraints; no triggers/schema/security were changed.

`scripts/sale-print-http-isolated.cjs` passed: authenticated HTTP rendering for an ORDER_VIEW-only SELLER, unauthenticated login redirect, tenant and branch denial, missing ORDER_VIEW, immediate permission revocation and inactive membership. Next.js streaming returns some denials as HTTP 200 with explicit `notFound`/redirect boundaries; assertions check those actual boundaries and absence of order data, not the transport status alone.

The actual sale-card link opened the real route in Chrome. Desktop 1440/mobile 390 displayed BULK ordered/issued/remaining 7/3/4; serialized issued and merely assigned items displayed 1/1/0 versus 1/0/1, with identifiers only on actual issued facts. The hydrated existing PrintButton invoked `window.print()`. Print media hid controls, and PDF generation from the real HTTP page passed. Operation table counts and hashes were identical before/after requests and printing. Test sessions were deleted afterwards.

Evidence in workspace `sale-http-evidence/`: `result.json`, `operation-invariants.json`, `source-parity.json`, `setup-result.json`, `real-http-sale-print.pdf`. The earlier static-only limitation is now closed for authenticated local HTTP; physical printer/iPhone remain untested. UI publication SHA `8628df12` is unchanged and independently frozen; no push, deploy or Production action occurred.
