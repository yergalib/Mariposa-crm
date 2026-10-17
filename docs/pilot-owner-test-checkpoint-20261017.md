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
