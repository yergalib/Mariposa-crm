# Sale technical handover sheet

Successor to UI candidate `8628df12a8b327ced9641b2887b31185ae33d77c`; separate local document change, not permission to publish either candidate.

The sale card now links to `/orders/[id]/sale-print`. The unsigned technical sheet reads existing order items, sale commitments and actual negative `SALE_ISSUE` movements. Assigned instances and order status are never treated as proof of issue. BULK movements across locations are summed; serialized identifiers appear only with actual movements. Planned, issued and remaining quantities are distinct, including partial issue. Removed lines retain their historical facts and have no pending issue claim.

This is a current operational view, not an immutable snapshot. The page states that subsequent printing can differ. No new tables, migrations, financial fields, payment claims, legal terms, signatures, handover operations or ledger writes. Existing rental print and immutable V1/V2 documents are untouched.

`getSalePrint` performs a read-only repeatable-read transaction with fresh `workflowScope(..., ["ORDER_VIEW"])`, active organization/branch and tenant scope. The route additionally requires authenticated `/orders` access and `ORDER_VIEW`. Projection excludes all money and contact fields.

Validation: targeted service and server-rendered page tests cover BULK partial quantities, serialized assignment versus actual issue, escaped text, no financial projection, tenant/branch/type isolation, revoked permission and inactive membership. Mock client exposes no mutation methods and fixture contents remain unchanged. Targeted ESLint passed. Chrome checks of isolated server-rendered HTML passed at desktop 1440 and mobile 390 pixels without horizontal overflow; print controls disappear under print media and PDF generation succeeded (68,955 bytes).

Browser evidence: workspace `sale-print-layout-evidence/result.json` and `sale-print.pdf`. This is a static route-render fixture, not an authenticated browser HTTP journey. Physical printer/iPhone not tested. No production data or publication involved.

The existing checkout dependency junction lacks `@vercel/functions/db-connections`, so its direct typecheck reports that pre-existing missing dependency. An isolated source copy with the existing exact UI build dependencies is used for final build/type validation; no environment files or live database connection are copied.

Final isolated Next.js 16.3.3 webpack build: PASS, including TypeScript and generation of 66 static pages. Dynamic sale-print route included. DATABASE_URL used offline localhost port 1; no env files copied.
