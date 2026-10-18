# Owner-only Pilot history test checkpoint

This implements the approved single synthetic Inquiry test on a separate Preview in the existing project. No hosted test has run at this checkpoint.

The dedicated `/pilot-history-test` page requires the existing CRM session and the exact approved Pilot OWNER membership. Ordinary showroom intake and the real LLM remain disabled. The page explicitly labels its dialogue as a synthetic fixture, not an AI response.

An explicit start writes one immutable `PILOT_HISTORY_TEST_STARTED` audit record. Its database timestamp defines a 30-minute window; concurrent starts, refresh and redeploy cannot reset it. The server checks the window on history operations and within write transactions. Closure disables test history reads/writes and handoff, without deleting the Inquiry or audit.

Consent and handoff use one fixed run key. The server restricts the synthetic contact, branch and selected published product/variant, and requires labelled synthetic messages/context. Existing product publication and tenant checks still run. The expected persistent records are one conversation, its messages, one Inquiry/item, one start audit and one INQUIRY_CREATED audit. No order, payment, stock allocation or notification is created.

Validation:

- `scripts/assistant-pilot-test-isolated.cjs`: 10 real local SQL/API/service checks PASS, including parallel handoff, retry, staff transcript, expiry and non-restart. See `evidence/pilot-owner-test-20261017/local-sql.json`. Controlled clock is only in the test harness.
- Existing isolated Preview checks: 27 PASS plus seed assertions.
- Full ESLint: zero errors, seven existing warnings in unrelated files.
- Offline production build: PASS, zero attempted external connections, no environment files read.
- TypeScript is checked by the production build; a final standalone check is also run before commit.

Hosted browser → API → save → staff visibility and real-time expiry remain pending. Existing Vercel Authentication redirects unauthenticated requests to `/sso-api`; normal owner login is required. No protection bypass, credential extraction, model calls, migration, hosted data write or environment mutation was used for the local checks.

Publication attempt: source commit `b78b8852411cb4c883ea6e97ba15c1a53079e570` was pushed to the candidate branch. Four nonsecret settings were created only for that Preview branch. Deployment `dpl_3FdAcxKfrFbArw5TWEEqxMSHYpUN` failed at `npm run build` with `BUILD_UTILS_SPAWN_1`; detailed logs return 404 through the available unscoped API. No automatic retry, access expansion or window start occurred. The automatically triggered Git build was canceled because it started before settings were created. See `evidence/pilot-owner-test-20261017/deployment.json` for actual hosted state and the read-only zero-record recheck. The local PostgreSQL test server was stopped after validation.

Chrome follow-up: the owner dismissed the 2FA setup proposal. Existing Chrome session opened actual Build Logs. Initial failure was the new Pilot URL guard during collection of `/products/[id]/photos`, not TypeScript. Diagnostic commit `934c03c8f42abd25010ab2e478ce1a8949e9fc42`, deployment `dpl_357ynainNcfZdv4iyHXzo6E23i7y`, reported only `TLS_MODE,TLS_PARAMETER_COUNT`. The inherited URL omits `sslmode`; the guard had incorrectly required it. The correction accepts absent `sslmode` without rewriting the connection or pool configuration. Explicit TLS downgrade, duplicate parameters, wrong project/username/database/port and unsupported endpoint overrides remain rejected. This preserves existing transport behavior; it does not assert independent verification of transport TLS. No connection value or credential was read or logged. Targeted synthetic binding tests and all 27 isolated Preview checks pass.

Final deployed application checkpoint: `3c3c2acf563b926e79132d0d4641a0b54c6f3876`, deployment `dpl_GhtMjaho8GeNDmWnAi1mQ5dRzqrr` is READY. Local offline build also passed. Actual Chrome requests to both candidate hosts return 403 before CRM. Read-only inspection of the existing `MARIPOSA maintenance` deny rule found four allowed hosts, excluding both candidate hosts. No rule was edited, saved or disabled. At 14:18:34 UTC Pilot still had zero conversations, zero inquiries and zero start audits. The real window and browser E2E have not started. Evidence: `evidence/pilot-owner-test-20261017/ready-and-browser-block.json`. Continuing requires resolving access under a separately authorized scope; do not bypass the rule or repoint a stable alias.

Later owner approval (14:59 UTC) permitted exactly one temporary immutable-host exception with mandatory cleanup. Chrome UI staged and published the exact fifth Hostname Does not equal condition, preserving the original four AND conditions and Deny. The browser then reached the normal CRM login form, with no existing OWNER session or populated credentials. No credentials were submitted and no application test started. The fifth condition was removed, the cleanup was published, a freshly loaded rule verified the exact original four conditions, and a fresh browser request returned 403 again. At 15:10:02 UTC Pilot remained at zero conversations/inquiries/items/start audits/Inquiry-created audits, five existing orders and zero fittings. No temporary WAF exception remains. Evidence: `evidence/pilot-owner-test-20261017/temporary-waf-cleanup.json`. Real-time 30-minute closure, handoff/retry and staff visibility remain untested on hosted Preview because CRM login blocked the test before its start.

## 2026-10-18 hosted owner test

Source deployment: `3c3c2acf563b926e79132d0d4641a0b54c6f3876`. Normal owner login and Pilot organization selection succeeded. One conversation with two synthetic messages was saved with consent. Handoff created Inquiry `649d7cfe-349c-4a0c-b199-33eac22ae86b`; retry from a stale preloaded tab produced no duplicate (one Inquiry, item and creation audit). Reload restored history/status and the actual staff CRM page displayed the saved context. Last observed orders/fittings/allocations stayed 5/0/4; model calls and external messages were zero.

Stopped on request before the real application expiry at 07:10:42.527 UTC, so expiry enforcement remains unverified and no final data query was performed. Temporary hostname WAF exception was removed and published; fresh rule reload verified exactly the original four conditions with Deny. Fresh immutable-host request returned 403, request `fra1::v6cjc-1792307147553-a2fe48d01fca`, verified 07:05:55 UTC. No access exception remains. Detailed evidence: `docs/evidence/pilot-owner-test-20261018/hosted-e2e.json`.

### Read-only expiry follow-up

At database time 2026-10-18 07:10:59.952108 UTC, one SELECT confirmed the original single start audit at 06:40:42.527 UTC and elapsed deadline 07:10:42.527 UTC. Counts remain conversation/Inquiry/item/Inquiry-created-audit = 1/1/1/1; orders/fittings/allocations = 5/0/4. Financial transactions, orders and allocations created since start are all zero. No remote write or new test was performed; WAF was not reopened. LLM calls remain zero for this test (execution record and disabled-model configuration; no provider usage query was made).

Application HTTP enforcement after expiry remains unverified behind the restored WAF. Source computes closed state from the first start audit and does not write a separate closure audit; expected GET closed status and write 410 must not be represented as observed hosted responses.

Login clarification supersedes earlier wording: a normal authorized OWNER session was observed in the existing Chrome profile after a login page. The agent entered no credentials and read no secrets/cookies. Evidence does not distinguish manual owner login from recovery of an existing normal session.
