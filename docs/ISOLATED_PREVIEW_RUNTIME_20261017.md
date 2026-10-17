# Local isolated Preview candidate

This supersedes the preparation-only status in `ISOLATED_PREVIEW_PREPARATION_20261017.md`. **Correction:** `Mariposa test-1` referred to the AI key/project in the conversation, not a confirmed hosted database. Do not ask the owner for its database ref. No hosted test database has been identified or created.

## Runtime wiring completed locally

`lib/assistant/isolated-preview.ts` resolves an explicitly configured test target, with no built-in target or secret. `lib/env.ts` checks it before returning the DB connection to the pool factory. The candidate branch always requires valid isolation configuration, even if the activation variable is missing. Production, wrong project/ref/tenant, expired windows, the known live Supabase ref, mismatching host/database/user, extra connection override parameters, missing password, and non-verifying TLS fail closed. Diagnostics never echo the URL. Supported endpoints are direct Supabase PostgreSQL or the project's session pooler on port 5432, whose username must contain the configured project ref.

History route and service use server-side `historyEnabled` / `historyHandoffEnabled`; every owner-specific operation rechecks organization. The existing Inquiry writer, idempotency, explicit consent/confirmation, ownership cookie, CSRF, publication checks and permissions remain in use. Global retention is disabled in this candidate to avoid an all-tenant maintenance operation. Generic `PUBLIC_INQUIRY_INTAKE_OPEN` remains false. `HISTORY_OPEN` remains false outside the configured candidate. The owner LLM gate rejects the isolated candidate even with an inherited API key. Storage configuration returns null before reading inherited storage keys.

The server page passes only capability booleans to the existing HistoryControls. The UI identifies the isolated synthetic environment, keeps AI unavailable and preserves the real committed-Inquiry receipt semantics. No mock provider is shipped. Config expiry is also enforced on subsequent history requests, regardless of previously rendered controls.

The stable Preview's branch/ref/configuration and Production remain untouched. An unconfigured candidate fails closed; this is intentional, not permission to deploy it with the current inherited DATABASE_URL.

## Nonsecret configuration contract

After resource and credential/configuration approval, set **only candidate-branch Preview overrides** in the existing Vercel project. No values have been saved remotely.

| Variable | Required value |
| --- | --- |
| VERCEL_ENV | Platform-provided `preview` |
| VERCEL_PROJECT_ID | Platform-provided `prj_FSsQxUktUBH9VNCGeadBoNnzlD1W` |
| VERCEL_GIT_COMMIT_REF | Platform-provided `review/ai-header-preview-candidate-20261011` |
| MARIPOSA_ISOLATED_PREVIEW | `synthetic-history-v1` |
| MARIPOSA_ASSISTANT_ENABLED | `0` |
| MARIPOSA_TEST_DB_BINDING | `review/ai-header-preview-candidate-20261011` (operator acknowledgement that the DB variable was scoped to this branch) |
| MARIPOSA_TEST_DB_REF | Newly created dedicated test project ref, never `jawposhuxaexoqzopgoq` |
| MARIPOSA_TEST_DB_HOST | Exact approved direct or session-pooler host; no default |
| MARIPOSA_TEST_DB_NAME | Exact approved database name; no default |
| MARIPOSA_TEST_ORGANIZATION_ID | Synthetic seed tenant `a0172026-1017-4017-8017-000000000001` |
| STOREFRONT_ORGANIZATION_ID | Same synthetic tenant, candidate branch only |
| MARIPOSA_TEST_START / MARIPOSA_TEST_UNTIL | Explicit UTC ISO timestamps, active window no longer than 24 hours |

**One secret variable is needed: `DATABASE_URL`.** Owner manually enters the dedicated test connection (new test DB password, correctly URL-encoded) through the provider/Vercel secure interface after separate approval. Use TLS `sslmode=verify-full` without extra URL parameters. Session pooler identity is `postgres.<test-project-ref>`; direct identity is `postgres`. Do not send the value in chat or commit it. Synthetic staff login credentials are entered through existing auth flows; no login bypass or password is part of the seed. No OpenAI key, Supabase service key, Vercel key or WAF bypass key is required for this phase.

These configuration assertions cannot independently prove an operator's resource ownership or an unused free slot. Before configuration, verify the newly created project identity and branch-specific binding read-only. No production-data clone. The legacy shared variable must never be used as a test connection.

## Concrete hosted DB recommendation and cost

Read-only `supabase_get_organization` confirms existing organization `uvrcbktkaewtsrmuwnhq` / `Mariposa crm` has **Free / tier_free**. Only one project is visible to this connector. Account-wide remaining quota is **unknown**.

Recommend creating **one separate Supabase Free project**, proposed name `Mariposa isolated-preview`, inside that existing organization. Do not create a second Vercel project. Free permits two active projects across organizations where the account is Owner/Admin. If a slot is available, the test DB costs **$0/month** within Free limits: 500 MB database and 5 GB egress; it may pause after a week of inactivity. Branching is not included in Free, so a development branch is not the minimum free option. [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [official pricing](https://supabase.com/pricing).

If the dashboard refuses a free slot, stop before provisioning or upgrading. Pro starts at $25/month for the organization; a second Micro project adds approximately $10/month, roughly **$35/month total** for two Micro instances before extra usage/tax, billed compute hourly. That is a separately approved paid alternative, not an authorized expense. No cost confirmation token, project creation, subscription change or purchase was performed. [Official pricing](https://supabase.com/pricing).

## Seed and test sequence

`scripts/isolated-preview/seed.ts` is typed input for existing Prisma models: two synthetic tenants, public Almaty-timezone branch, size 140, white/blue dresses at 18,000/12,000 KZT, an unpublished dress and a foreign-tenant dress. No personal data, stock, reservations, auth sessions or new schema. The existing migration `20261010150000_assistant_history` supplies persistence. Apply only existing schema/migrations plus this seed to the independently verified empty test resource, after write approval; no live migration has run.

`scripts/isolated-preview/runtime-test.cjs` executes actual runtime config/env/gate/history-service/route modules against synthetic environment and instrumented DB, with no network. Tests include inherited-key denial, direct/session-pooler identity, production/wrong scope/TLS/expiry failures before DB use, unchanged stable handling, foreign-tenant rejection, no global retention and no generic intake opening. `check.cjs` runs seed assertions plus this runtime test; the obsolete preparation-only policy implementation was removed.

The real local SQL harness and actual Next HTTP harness are rerun after wiring; they still override release gates in isolated fixtures, while the new runtime test covers the configured candidate path. The browser fixture verifies receipt/retry/duplicate handling and comparison pixels. These do **not** claim a deployed whole-showroom-to-staff E2E. The full acceptance matrix in the preparation document still applies after hosted resource/configuration/deployment approval. Real LLM remains off; scripted provider tests remain local only.

Final local evidence is in `docs/evidence/isolated-preview-runtime-20261017/`: **27 runtime checks**, seed assertions, **12 real SQL/service checks**, **8 actual Next HTTP checks**, and **7 browser checks** passed. Consultation, restored-selection and comparison-presentation regressions also passed. Standalone typecheck passed; full lint has 0 errors and the same 7 existing warnings. Isolated Next build passed with no env files and no external network attempts. Browser screenshots include 390/430/1440 comparison layouts. Local fixture server and PostgreSQL were stopped after testing. No hosted connection, schema write, paid model call, push or deployment occurred.

## Next approval boundary

The next concrete owner decision is permission to create the proposed **Free Supabase test project in the existing organization**, conditional on an available free slot and no charge. If a charge/upgrade is required, stop and present the exact dashboard price. Resource creation and secure DATABASE_URL configuration require separate permission; neither is implied by preparation. After identity verification, schema/seed approval and secure configuration, approve the exact local SHA for candidate-only deployment. Stable Preview/main/Production are excluded throughout.
