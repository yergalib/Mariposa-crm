# Existing Pilot: bounded E2E without a new database

Read-only review following the owner's clarification that MARIPOSA CRM is not currently operational (RemOnline is used). Synthetic test writes through normal services/UI are authorized; deployment, security-gate changes, new credentials/configuration, external notifications, real payments and bulk deletion remain outside that approval. No resources or test records were created in this review.

## Conclusion

**Reuse the existing Pilot for the first bounded history/handoff E2E. A separate DB is not mandatory.** The earlier separate-DB recommendation was a stronger isolation choice, not a discovered prerequisite. Shared schema does not itself prevent a tenant-scoped Inquiry test. The outstanding blockers are the published closed gates, the local candidate's deliberate shared-resource denial, and access to the protected Preview/CRM session.

## Verified target and before state

Supabase project `jawposhuxaexoqzopgoq`; tenant `de1e9e01-c7ad-45fc-899a-d2287f771355`, **MARIPOSA — PILOT**, ACTIVE. One public ACTIVE branch: `029dac34-94d7-490d-9047-0e198d8785ff`, `Asia/Almaty`. One ACTIVE OWNER membership: `79b6a6cd-98f1-4cb9-8bc5-4285ab70bbc1`. There are 330 public ACTIVE products. Product, photo and price records were not changed or exported.

At **2026-10-17 12:49:45.381807 UTC**: 0 conversations, 0 inquiries, 0 inquiry items, 0 INQUIRY_CREATED audit events, 5 orders, 0 fittings, 3 ACTIVE capacity allocations in this tenant. Existing orders/allocations must remain untouched. These counts are a preflight snapshot, not a concurrency-safe proof for a later run; repeat the relevant snapshot immediately before the authorized run.

`assistant_conversations`, `assistant_messages`, `assistant_history_quotas` and `assistant_provider_attempts` already exist. Migration `20261010150000_assistant_history` is recorded finished, not rolled back. Inspected history columns/constraints match the local path; the enabled `assistant_history_tenant_guard` verifies branch tenant and linked Inquiry tenant/branch. **No additional migration was identified for this test.**

Deployment metadata from existing Vercel project `prj_FSsQxUktUBH9VNCGeadBoNnzlD1W`, without team scope:

| Deployment | Branch / SHA | Relevance |
| --- | --- | --- |
| `mariposa-busodjvtg-mariposa-crm.vercel.app` | `review/pilot-preview-rollout`, `77e6bf41fb3f5e040fb5b1f5648ae2898dab2306`, READY | Old Pilot deployment; its source does not contain the current history contract. Do not move development back to it. |
| `mariposa-7x59nlanv-mariposa-crm.vercel.app` | `review/ai-header-preview-candidate-20261011`, `326155e0906ff48ec4c869d0e5e2b4352af81133`, READY | Published candidate; source has HISTORY_OPEN=false and PUBLIC_INQUIRY_INTAKE_OPEN=false. |
| `mariposa-bcsc6s1nc-mariposa-crm.vercel.app` | `review/website-current-20261009`, `46a819eac0cf0136fe68457f97335239af2dbd26`, READY | Stable branch; leave unchanged. |

Unauthenticated GET of candidate `/showroom` and `/api/showroom/history` returned **302 to `/sso-api`**. No bypass link/token or security change was requested. Runtime tenant/variable values were not independently verified behind SSO; the verified Pilot identity above comes from read-only DB metadata. The source flags are verified at the deployment's SHA, not guessed from the HTTP response. No environment secrets were read.

## Actual write chain and availability

The assistant's tools in `lib/assistant/chat/tools.ts` are read-only. There is **no `requestReservation`/`request_reservation` implementation in current app/lib source**. Booking-only confirmation requests are explicitly refused in the consultation path.

Explicit HistoryControls confirmation calls `/api/showroom/history` → `writeHistory(action=handoff)` → `createInquiryRecord`. This creates an Inquiry and selected InquiryItem rows, appends one `INQUIRY_CREATED` audit event, links the committed Inquiry to the conversation, and increments the conversation version. Consent/save creates or updates conversation/messages and bounded history quota counters. The history API does not call order, payment, fitting, stock or capacity mutation services.

The separate public “booking request” path `submitPublicInquiry` uses the same Inquiry writer. Its requested dates are request fields, not a stock reservation. It remains globally closed and need not be enabled for the history-handoff test.

Availability in `lib/availability/capacity.ts` depends on active capacity allocations; it does not subtract Inquiry rows. `reserveOrder` is a separate operation which creates capacity allocations; payment is not a prerequisite in that path. Thus an actual unpaid reservation could block stock, but **this first test needs no reservation at all**.

The inspected application writer only performs Inquiry/audit persistence, with no external send or notification call. The relevant DB triggers are context/integrity checks; metadata checks found no DML/EXECUTE/NOTIFY/http/net/PERFORM/CALL statements in their function bodies. No automatic order/reservation/notification path was found in this inspected chain. This does not attest unrelated external automations. Use an `.invalid` synthetic contact and prohibit any external-send action.

Audit is immutable and must remain. Do not promise a clean database with no trace afterward. A test Inquiry can be closed normally if desired; do not delete audit or reset shared tables.

## What tenant isolation covers, and what it does not

The application scopes conversation lookup by organization + owner capability + principal; branch/product validation also checks organization/publication. Staff Inquiry retrieval checks LEAD_VIEW, membership/branch access and tenant. DB triggers reinforce the conversation's branch/Inquiry consistency. These controls can support a small operator-only Pilot test without touching other tenants' business rows.

History tables have **RLS disabled**. Isolation here is application/trigger enforcement, not an independently isolated database role. Shared DDL, global retention/reset queries, broad cleanup, test failure triggers, shared env changes, connection load and incorrect unscoped code would still affect the shared resource. Therefore **do not run the local DB-creation/failure-trigger/reset harnesses against hosted Pilot**. No new DDL, global cleanup, catalog seed or destructive test is necessary. Quota writes use Pilot-derived keys; this still consumes a small part of Pilot's own quota.

## Minimal concrete package requiring separate approval

Current local `c192f22656655570a7dad43c30270a0341fb258b` rejects this DB through `LIVE_RESOURCE`. Do not remove that check generally or spoof an isolated resource. Prepare a distinct, explicitly approved **Pilot-only history-test mode** in a new reviewed patch:

1. Allow only the exact existing project, candidate branch, Preview environment, Pilot tenant, public branch and OWNER membership listed above; require normal active CRM login. Reject guests, another member/tenant, Production and wrong ref. Keep the existing isolated-mode restrictions unchanged.
2. Bind a single run marker/contact, one creation/handoff attempt identity, and a short window (maximum 30 minutes). Enforce at most one new test Inquiry; retries reuse the same idempotency key. No arbitrary bulk writes. Preserve all current validation, consent, CSRF, publication, quotas and receipt checks.
3. Enable only history + history-handoff in that mode. Keep global intake, LLM, payments/reservations and global retention off. Existing canonical Inquiry persistence remains unchanged. Do not pretend the LLM is available.
4. Deploy the specifically approved new SHA only to the existing candidate branch/project. Do not deploy current `c192f22` unchanged expecting it to accept shared DB. Do not alter the old Pilot branch, stable alias, main or Production.

Proposed **candidate-branch-only** nonsecret settings for that new mode (not implemented or applied in this review):

| Key | Target value |
| --- | --- |
| MARIPOSA_PILOT_HISTORY_TEST | `1` |
| STOREFRONT_ORGANIZATION_ID | `de1e9e01-c7ad-45fc-899a-d2287f771355` |
| MARIPOSA_PILOT_TEST_OWNER_MEMBERSHIP_ID | `79b6a6cd-98f1-4cb9-8bc5-4285ab70bbc1` |
| MARIPOSA_PILOT_TEST_BRANCH_ID | `029dac34-94d7-490d-9047-0e198d8785ff` |
| MARIPOSA_PILOT_TEST_CONTACT | `e2e-pilot-20261017@example.invalid` |
| MARIPOSA_PILOT_TEST_RUN_ID | A newly generated nonsecret UUID fixed for this single run |
| MARIPOSA_TEST_START / MARIPOSA_TEST_UNTIL | Exact UTC timestamps agreed at activation, maximum 30 minutes |
| MARIPOSA_ASSISTANT_ENABLED | `0` |

Use the existing connection without extracting, copying or replacing its secret; validate its approved resource binding in server code. No new credential or paid model run is needed for this first test. The specific gate/config/deploy package still needs approval; the owner's test authorization alone does not enable it. Use an authorized existing Vercel + CRM browser session, not a new bypass token.

## Bounded test after that approval

Use existing published Pilot product(s) read-only, synthetic dialogue/contact marked `E2E PILOT <run-id>`, and one consenting operator. Perform consent/save → refresh → handoff → duplicate click/retry → staff Inquiry detail. Expected writes: one conversation, a few synthetic messages, two Pilot-scoped quota keys, exactly **one Inquiry**, 1–2 InquiryItems and one INQUIRY_CREATED audit. Assert no added orders/fittings/active capacity allocations and unchanged selected-variant availability before/after for identical dates. No payment or reservation step is needed; no catalogue/price/photo update, external message or cleanup delete. Close the test Inquiry through normal UI only if required, keeping its audit.

This checks real persistence and staff receipt, not live LLM generation. A model run remains separate and must obey the previous $5 budget/session authorization; no key request is needed now.

At the end of this read-only review: **remote writes 0, resources created 0, model calls 0, security/config changes 0**. No E2E success is claimed while the actual path is closed/protected.
