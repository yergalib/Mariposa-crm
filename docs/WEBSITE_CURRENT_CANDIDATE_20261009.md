# Website candidate on current CRM — 9 October 2026

## Scope and provenance

Local branch `review/website-current-20261009`, isolated checkout `mariposa-website-current`, based exactly on CRM `4648d70cee004c01d515770c389370dd34a3114b`. Website files were selectively restored from local `b310782c4d58f604a3a21692ef7011b4ece459d1`; the old branch/core/package files were not merged. The baseline schema, migrations, auth actions, business services, roadmap and audit F1–F7 fixes remain unchanged. Source checkouts are untouched.

Owner decisions carried forward: existing Next/React project; approved Cormorant Garamond 500 + Onest 400/500, original logo and approved hero; rental showroom, no checkout/payment/automatic reservation. Branch/size/dates → real CRM availability → employee-confirmed request. No invented price, picture, category, appointment slot or rental condition. Source history: https://chatgpt.com/share/6abd2319-c2a0-83eb-93d9-184083d4c3c9 and current project handoff.

## Implemented locally

- Restored responsive shell/mobile menu, home, color/size/date catalog, product detail, favorites/comparison, fitting draft, contacts/footer and existing assistant-ui ExternalStoreRuntime foundation.
- Public services use server-bound PILOT tenant, explicit public branch/product gates and current CRM `variantOperationWhere(..., "RENTAL", true)`. Direct and execution-level rental/publication prohibitions now apply before pagination and selection, including the future gated inquiry writer. Availability uses unchanged CRM capacity logic, including BULK.
- Public DTOs contain only names, sizes, execution/color, selected current rental price and availability. No procurement, margin, inventory identifiers, customer/staff contacts or internal notes. Prices are current branch-specific/global catalog entries; missing price remains “Уточнить стоимость”. Price is displayed after exact selection, not guessed on group cards.
- Other-product links retain entry filters/dates. The section is called “Другие платья”, without claiming similarity. Photo slots visibly say “Фото скоро”; no private CRM photo URLs are published.
- CRM navigation/permissions retained. Only logout form wrapper clears tab state; existing server logout is unchanged. Proxy adds an exact website allowlist and retains CRM API's anonymous JSON 401.
- Fixed stale synthetic test assumptions for current execution policy, explicit sizeCode and assistant-ui component boundaries. Added real browser and built-Next local harnesses; no synthetic public App Router route.

## Dependencies and checks

All previously locked CRM package versions are preserved, including Next/eslint-config-next 16.3.8, Sharp 0.35.5 and root Zod 4.4.3 (now pinned). Added exact assistant-ui/react 0.15.25 and OpenAI 7.25.0 for the restored existing code. Assistant-ui requires a separate nested Zod 4.6.5; it does not upgrade CRM's copy. No added lifecycle scripts. Official registry install used `--ignore-scripts`; Prisma Client generation used an unreachable synthetic localhost URL and did not connect to a database. Assistant Cloud is a transitive dependency, not a configured service.

Passed locally:

1. TypeScript `--noEmit`, targeted ESLint over all restored source plus changed integration files, and optimized Next 16.3.8 build.
2. All 21 `scripts/showroom-*-smoke.cjs` synthetic suites. Includes execution/publication rejection, color pagination, availability/price DTOs, calendar/cancellation, outfit, favorites, retained input, idempotency-shaped retry, tab expiry/logout and carousel behavior. These mock data access; they are not live DB tests.
3. Actual assistant-ui runtime SSR test: escaped output, bounded history, pending/empty/new thread, zero network requests.
4. `scripts/showroom-browser-local.cjs`: fresh headless Edge, actual React components/styles/fonts/approved assets, synthetic DTO/API. Widths 1440/768/390; catalog → product exact size/dates, current/missing price, unavailable variant, cancellation/late-result rejection, unsent fitting wishes, favorites/comparison, mobile menu Escape/focus, helper opening, no horizontal page overflow. No POST from this browser run. Next Link/Image/router use local test adapters; this does not claim real DB end-to-end coverage. Desktop/mobile home screenshots inspected internally, not published.
5. `scripts/showroom-next-local.cjs`: actual built Next on localhost with sanitized child environment and unreachable synthetic DB URL. Anonymous showroom/contact/fitting routes; unavailable catalog fails closed; CRM redirects and API 401; intake rejects empty POST with 503 before DB; assistant rejects anonymous access; approved logo available. Localhost is used consistently because Next normalizes the loopback request URL for origin checks.

## Deliberately closed / remaining release gates

- `PUBLIC_INQUIRY_INTAKE_OPEN = false`. Fitting/booking screens are local drafts with an explicit unsent state, no contact collection or CRM write. Real appointment scheduling is not claimed.
- AI provider was not invoked or configured. Existing access restriction is staff-only PILOT Preview on `review/pilot-preview-rollout`; complete JSON responses, not token streaming. No durable conversation/handoff or messenger integrations are claimed.
- Product galleries await a reviewed public-photo contract and approved assets. One approved hero is present; no second image fabricated/imported. No independent photo publication field is added here.
- Real-data browser/DB flows, Production release, full security audit and customer-facing personal-data/legal readiness are not verified by these local tests. Earlier Prisma-history mismatch remains a release/application gate; this task neither rechecks nor changes real migration state. Previous Preview/WAF restriction is historical handoff information, not rechecked here.
- No GitHub push, Preview deployment, main merge, Production/database operation, schema/env/WAF/credential change. Existing open intake/AI/tenant gates must not be weakened to make a Preview look populated.

Next requested release action is narrow: publish this reviewed candidate to a separately verified non-production branch and create Vercel Preview, preserving all current gates and infrastructure settings. Recheck remote head/team/project/environment before any publication; do not substitute the old b310782 branch or force-update a diverged branch. Deployment approval is separate from approval to open intake or connect real customer data.
