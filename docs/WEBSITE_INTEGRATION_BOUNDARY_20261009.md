# Website integration and release boundary — 9 October 2026

This update supersedes the initial candidate's photo/history limitations. Source: local code on CRM `4648d70` plus authorized read-only Supabase MCP queries on 9 October. No customer records, credentials, image bytes or contact values were retrieved. Vercel configuration could not be verified with the available connector.

## Real services, not a fixture application

| Function | Current implementation |
| --- | --- |
| Branches | `publicBranches()` → CRM Branch, server tenant, ACTIVE organization/branch, `isPublic=true`; only ID/name/city/timezone |
| Browse/search/colors/sizes | `/showroom` SSR → `publicBrowse()` / `publicCategories()` / `publicProduct()` → existing Product/Execution/Variant/Size/Category; shared `variantOperationWhere(..., RENTAL, true)` applies product and execution/direct overrides before pagination |
| Guided catalog | `GET /api/showroom/catalog` → `publicCatalog()` on the same tables/policy; no second catalog |
| Exact current price | `GET /api/showroom/selection` → `publicSelection()`; current ProductPrice RENTAL rows, branch-specific before global, validFrom/validUntil, exact variant; missing price stays null. Group cards do not invent a price range |
| Availability | Both public reads call existing `getVariantAvailability()`; same BULK/serialized capacity logic as CRM, branch timezone, explicit rental interval, no reservation |
| Photos | `publicPhotos()` reads ACTIVE, nondeleted ProductImage records for the exact eligible product/execution, at most eight; excludes variant-specific photos, emits only local endpoint URLs/dimensions/generated alt. Catalog, favorites, recommendations and product gallery render those DTOs |
| Photo bytes | `GET /api/showroom/photo` rechecks public branch and product/execution publication, tenant and image ID, then server-only Storage `download` of existing `.site.webp` rendition; private no-store response, no storage key/signed URL sent to browser. Missing rendition/error falls back to visible placeholder; originals are not released |
| Booking/fitting request | `POST /api/showroom/inquiries` → `submitPublicInquiry()` → shared `createInquiryRecord()` also used by authenticated CRM `createInquiry()`. Existing Inquiry/InquiryItem + audit transaction, source WEBSITE, nullable author, NEW default; idempotency/limits/publication checks retained |
| Staff scheduling | Existing `createFitting()` remains staff-only: FITTING_VIEW/MANAGE, assignee/branch permissions, actual 30-minute employee conflict check and link to Inquiry. Anonymous visitors never invoke it or select fabricated slots |

The catalog read boundary now uses only explicit server `STOREFRONT_ORGANIZATION_ID`, not the old hardcoded PILOT organization. No client tenant override exists; Production remains blocked for this Preview candidate. AI's separate staff/PILOT/branch restriction is unchanged. No env value was read, copied or changed. Therefore the actual Preview binding is still unverified.

Photo placeholders were genuinely in the real UI of `d88611e`, not merely the synthetic fixture. The new loader removes that code gap. The actual data may still require placeholders. Product/ execution publication controls the eligible photos; there is no separate per-photo public-consent flag. Review published groups/assets before release rather than making the private Storage bucket public.

## Why sending remains closed

`PUBLIC_INQUIRY_INTAKE_OPEN=false` is an explicit release guard, enforced both by the HTTP route before reading contacts and by the server service before parsing the payload/DB lookup. No environment or URL bypass was added. The service and database fields exist; this is not a missing permission/table blocker. Staff permission checks remain in CRM; no anonymous request is given a forged staff session.

The future enabled form sends a bounded purpose (booking/fitting), optional preferred local visit time, rental dates, exact selected variants and minimal reply contact. The service validates the visit time in branch timezone, stores it as an unconfirmed wish in Inquiry.requestText, and keeps the request NEW. It does not create a Fitting, Customer, Order, allocation, payment or inventory movement. Closed mode collects no contact and clearly marks drafts unsent. The shared writer was tested with synthetic transactions, not live database writes.

Remaining contact-intake decisions: approved operator/contact notice; documented purpose and chosen lawful basis/consent wording if applicable; retention/deletion period and implementation for contact/request data and backups; processor/access/logging arrangements; review of hosting/localization requirements. No legal consent text or compliance assertion has been invented.

## Current facts and precise blockers

- Supabase project metadata: active PostgreSQL 17.6, region `ap-south-1`. This does not establish Kazakhstan storage readiness. Need an approved storage/processing plan for Inquiry contacts and free text, including DB/backup/hosting/AI locations and operators; either accept the verified arrangement through the appropriate legal review or authorize a concrete change. Neither is performed here. Vercel env/regions could not be inspected, so end-to-end data location is unknown. AI/provider use stays separately gated.
- Read-only migration history: 54 rows, 53 completed, one historical rolled-back attempt, **zero unresolved**. `20260930130000_product_sheet_import` is completed and its checksum equals the local CRLF file (`f41f0015…`). Inquiry queue, public showroom and fittings migrations are completed and their LF checksums match the local files. The 30 September missing-history blocker is resolved; do **not** run resolve again.
- Stage8B still has the historical checksum difference: DB `631cf2ad…`, local LF `1a04fab2…`, CRLF `ba6d645b…`. This is not introduced by website work and is not a reason to reset/reapply Stage8B. It prevents treating blanket migration automation as clean; future DDL requires its own reviewed migration plan. This website update adds no schema/SQL.
- Verified schema: Inquiry reply_contact and nullable created_by_user_id, requested dates and idempotency fields exist; Branch.is_public exists. RLS enabled for inquiries/inquiry_items/fittings; anon/authenticated have no direct INSERT. Backend write-role permissions and all live constraints were not exercised.
- PILOT data: one public branch, 330 published eligible rental products / 1052 variants, zero active photos/current rental prices. This explains a photo/price-empty PILOT Preview; a UI rewrite cannot fill these values.
- Another published organization: one public branch, 112 eligible rental products / 457 variants. There are 187 active photos organization-wide; only 36 matched the eligible published product/execution groups in the aggregate query, and 10 matching Storage site-rendition entries were found. There are 477 current rental-price rows organization-wide; exact variant/branch eligibility still governs display. These are aggregate metadata, not a claim that every listed item has a public photo/price. Missing renditions require a separately approved generation/backfill procedure using existing CRM image processing; no files were generated in Storage here.

## Existing-project Preview path

Vercel MCP discovers team `mariposa-crm`, but project lookup returns 404, project listing is empty, and the known previous deployment lookup returns 404. This proves only that current connector access cannot inspect the project; it does not prove deletion. No Vercel CLI is installed in this checkout/PATH. No reauthentication, tool install, credential extraction or WAF/env change was attempted. Previous WAF denial is historical evidence, not a fresh observation.

Safe next Preview requires read-only access to the existing project's metadata: actual repo/project ID, production branch, Preview tenant binding and whether its database is shared with live, public asset Storage binding, deployment protection and hostname rule. Secret values must stay hidden. If the current Preview is already bound to the intended public catalog, this code can read it with intake closed; validate only reads. If it is bound to PILOT, the verified PILOT data limits apply. Choosing a different server binding, opening the exact Preview hostname or using an isolated DB is a separate concrete action; no self-service bypass is part of this candidate.

An anonymous Preview may validate the real read-only catalog/gallery against existing authorized data. Sending requests must be tested only against a positively identified isolated database, not merely a synthetic tenant in the live DB. Production launch and opening intake are separate from publishing a Preview. No owner request is needed to continue local code/fixture verification; no deployment is requested by this update.

Storage implementation reference: [Supabase private bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [download API](https://supabase.com/docs/reference/javascript/storage-from-download). Private bucket policy/settings are unchanged.

## Local verification of this update

Typecheck, targeted ESLint and optimized Next build passed before the final targeted checks below; application code has not changed since those checks. All 23 showroom synthetic suites passed, including photo access/DTO/rendition tests and the direct closed-intake service test. Existing CRM contact regression passed 14/14 scenarios through the shared writer with mocked transactions. Real Edge component harness passed with photo loading and thumbnail switching, plus desktop/mobile journeys. Built-Next localhost checks preserved CRM authorization and closed intake. No actual Storage image download, external provider request or live data write was performed.

### Final isolated PostgreSQL and mobile evidence

`scripts/showroom-isolated-pg.cjs --allow-isolated-showroom <existing-CRM-runtime-root>` verifies loopback port/user/server data directory against the existing synthetic CRM runtime and its audit fixture manifest. It exports **schema only**, creates a new empty `crm_showroom_<timestamp>` database, restores that schema and inserts only synthetic fixtures. It never loads app env files or reads live connection settings. Windows execution used the existing `-r ./scripts/test-runtime-preload.cjs` workaround. Final run: `crm_showroom_1791520252907`, PostgreSQL at `127.0.0.1:62317`, nine checks passed:

- Closed service gate rejects before touching payload/contact or database; application gate stays false. Only the isolated module loader enables the future path for tests.
- Actual generated Prisma client, shared writer, PostgreSQL transactions/FKs/defaults and audit: concurrent identical WEBSITE requests plus replay create exactly one NEW Inquiry, one item and one audit event, with nullable author/customer. Changed payload rejects. No Fitting/Order/allocation/inventory movement is created; the pre-existing synthetic Customer count remains unchanged.
- Foreign/private branch, foreign tenant variant, unpublished product, direct publication override, inactive variant and inactive size all reject on the real SQL query path.
- Manual CRM creation uses real membership permission checks, preserves contact/author/item/audit source, returns the same ID on replay, rejects changed replay and invalid membership.
- Real photo metadata queries deny private branch, unpublished/direct-disabled product, deleted image, foreign tenant and foreign/traversal storage keys. Strict service input rejects arbitrary URL/key. Actual route returns 404/private-no-store for denied records; valid response is WebP with nosniff/private-no-store. Extra URL/key query parameters cannot change the fixed rendition requested.

Storage alone is stubbed with synthetic bytes and an exact expected `.site.webp` key; zero real Storage calls/writes. The isolated database uses its test administrator, so this does not certify deployed backend-role privileges or production RLS behavior. Local evidence remains outside Git in `../showroom-isolated-evidence/result.json`; schema dump and synthetic rows are not committed. An initial fixture typo (`byteSize`, not a schema field) was corrected; the final run passed. The driver emitted a pg deprecation warning about concurrent client queries; no failed transaction or duplicate resulted.

`scripts/showroom-browser-local.cjs --mobile-draft-only` passed in headless Edge at 390px: simulated availability 503, successful retry, unsent fitting draft, repeated review, disabled submission, return/reopen retaining wishes, contacts navigation and browser Back retaining selection. No contact input, POST or runtime exception. This is the real component UI with synthetic API and lightweight Next navigation adapters, not deployed E2E. Existing broader successful suites were not rerun.

## Proposed read-only Preview and later intake decision

For scoped review, retain the existing false intake guard and require the assistant to report unavailable (no provider request). Use the existing project's Preview configuration only after read-only verification of its exact tenant/DB/Storage binding and assistant-off condition. If those conditions already hold, no env/WAF change is needed. Exercise only catalog, price, availability and photo GETs plus unsent drafts. If assistant-off or bindings cannot be established, stop that Preview step; do not silently enable a provider or edit settings. No publication is authorized by this document.

Before opening intake, the recommended conservative path is to keep this read-only mode while preparing one concrete release package for review:

1. Record the actual operator, response channel and staff access list; draft a short purpose/contact notice for that operator, without inventing consent or compliance claims.
2. Map verified DB, backups, hosting, logs and any processors/locations. Obtain qualified Kazakhstan requirements review and select a specific storage arrangement; current `ap-south-1` alone is not a readiness finding.
3. Propose a bounded contact/free-text retention period with the operator, then implement/test deletion and backup handling; no arbitrary retention rule is active today.
4. Keep LLM/messaging separate and off. Verify deployed backend write-role privileges and the full form/API flow against a positively isolated database, including duplicate/error handling and staff receipt.
5. Review eligible publication flags/assets, confirm the exact Preview/release commit, and explicitly approve opening the intake guard. Stage8B checksum handling is a separate migration-history task; this block contains no new DDL or resolve.
