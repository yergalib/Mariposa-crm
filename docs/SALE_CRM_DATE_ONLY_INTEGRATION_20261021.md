# Local SALE + CRM + date-only integration

Branch: review/date-only-crm-integration-20261021. Prior checkpoint: 805dcbf31b417f2f516a87cf18296848e1ac85ca.
Imported source 04a2d243892107ed0ed6948baad87e7ca77a0ded as 82b7061, with no conflicts. Source checkout was read only. Its existing port8876 fixture was not stopped; the combined checkout fixture used8878 and was stopped after testing.

Preserved compact CRM, consented AI history, recovery, date-only policy, colors and notification guards. No diff from805dcbf in app/chats, components/InquirySummary.tsx, app/crm-clarity.css or lib/assistant. Purchase uses existing WEBSITE Inquiry: purchase stated in subject/text, quantity1, server SALE price and variant snapshots, null rental dates. It is not a completed sale, order or payment and does not reduce stock. CRM structured purchase filtering is not added.

Combined validation PASS:
- Purchase7groups: strict purchase contract; rental/fitting compatibility; SALE policy/price without rental fallback; stable product identity; mocked inquiry/idempotency including concurrent duplicate; changed/missing price and unavailable stock; tenant/branch/owner rejection.
- Date-only32cases; dialogue32variations; recovery13; full-run dialogue; owner-day9groups; photo guards/batched reads; catalog colors; notification permissions; inquiry contact16cases; calendar UI; tab-state. Zero live provider or database calls.
- Final typecheck/lint/webpack build exit0 with synthetic owner-day configuration and TCP/TLS/fetch blocked. Evidence verification.json/build.log.
- New repeatable browser acceptance script scripts/showroom-purchase-browser.cjs: actual React components/styles, fixture-only data/fetch, isolated Edge profile, both390px and1440px. Switch rental->purchase->rental; distinct5000/32000 fixture prices; purchase no date/time inputs; missing price and stock prevent inquiry; selection change clears prior availability; required contact; double submit causes exactly1mockPOST per isolated scenario; receipt explicitly says sale/payment not performed; purchase payload has no rental dates; rental calendar retained. No horizontal overflow. Ten screenshots generated; both mode detail screenshots visually inspected at both widths.
- Compact CRM actual JSX fixture5states with transferred AI conversation and claim permission guards passed again after SALE integration.

Evidence directory: integration-sale-evidence/. Browser and server mocks are offline evidence, not live product/price coverage or hosted CRM persistence. No real inquiry/order/payment created; no DB/stock/cash writes, paid calls, environment/key/permission changes, push or deploy. Vercel403 remains untouched. Live acceptance and actual SALE SKU/price coverage remain pending authorized hosted access/publication.
