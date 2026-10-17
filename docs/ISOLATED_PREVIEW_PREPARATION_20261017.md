# Isolated Preview preparation — blocked on resource identity

Base: `f7fadb4dc079212e9a5da286383f33f72bf4c31b`. Preparation only; no push, deploy, credentials, remote writes, resource creation or paid calls. Existing Vercel project `prj_FSsQxUktUBH9VNCGeadBoNnzlD1W` (`mariposa-crm`), proposed candidate ref `review/ai-header-preview-candidate-20261011`. Stable `review/website-current-20261009` and its alias stay outside this candidate. No new project, custom environment or branch was created.

## Read-only discovery

On 2026-10-17, Vercel MCP calls omitted both `teamId` and `slug`. Deployment metadata confirms this existing project already has candidate-branch deployments (latest listed SHA `326155e0906ff48ec4c869d0e5e2b4352af81133`). This does not mean the new local checkpoint is deployed.

Supabase `list_projects` returned only `Mariposa crm`, ref `jawposhuxaexoqzopgoq`; its development branches list was empty. Vercel projects matching `mariposa` returned only the known project; project custom environments and project integration listings were empty. **The available connections do not identify `Mariposa test-1`.** It may be outside the connected account/access scope. No table reads against the known live resource were attempted.

Vercel variable metadata (`decrypt=false`, values excluded from output) shows `DATABASE_URL` has targets `production` and `preview`, without a branch override. It also shows inherited Preview storage credentials and an OpenAI key. Values were not decrypted or inspected. A normal candidate deployment could inherit a live DB; the label “Preview” is insufficient isolation evidence.

Machine-readable observations/proposal: `isolated-preview-candidate-20261017.json`. Unknown resource identity is null, not a guessed project or a green readiness assertion.

## Prepared local components and limits

`scripts/isolated-preview/policy.ts` is an executable, offline specification of the proposed server scope: exact project/ref/environment, verified dedicated resource endpoint, explicit candidate-branch DB binding, synthetic tenant/owner identity, disabled storage, short evidence expiry and disabled LLM. Missing evidence, shared live resource, wrong tenant/ref/environment or expired evidence closes every gate. Even the valid synthetic test scope enables only history and history handoff; generic public intake and LLM remain closed.

**This policy is not wired into application routes.** Source `HISTORY_OPEN` and `PUBLIC_INQUIRY_INTAKE_OPEN` remain false. It is not a claim that gates are ready for a cloud deployment. Wiring before independently verifying the target database would bypass the current release boundary. The evidence structure is operator-reviewed input, never browser input or an arbitrary env flag.

`scripts/isolated-preview/seed.ts` provides typed Prisma input for two synthetic tenants, public branch in `Asia/Almaty`, size 140, two public dresses priced 18,000 / 12,000 KZT, one unpublished product and one foreign-tenant product. Whole-unit `amountMinor` semantics are preserved. No stock is manufactured, no availability promised, and no user password/session, Inquiry, order or reservation is seeded. It is a **data plan**, with no database connection or write entrypoint. Typecheck checks it against current generated Prisma models. Actual transactional seed application remains pending resource verification and write approval.

## Exact activation design after verification

1. Resolve `Mariposa test-1` by nonsecret project ref/dashboard identity and access. Independently confirm a separate database/resource, no live data, no replication of customer records, and no live storage binding. Name alone is insufficient. Compare migration metadata read-only, including existing `20261010150000_assistant_history`; no new schema design is needed. Never run Prisma migrate/reset/seed against inherited defaults.
2. Review a precise candidate manifest with the verified ref, direct host/database, synthetic tenant and owner membership. Pooler URLs require explicit project/user binding verification; the prepared policy rejects them. Confirm candidate scope and expiry. The prepared seed tenant ID is a proposal, not a record that exists remotely.
3. Obtain separate permission for secure credential handoff and candidate-only configuration. Required secret name: `DATABASE_URL` (dedicated test DB connection). No `OPENAI_API_KEY`, Supabase service key, bypass key or new provider key is required for this phase. Do not paste secret values into chat, logs or repository.
4. After approval, use a **branch-specific Preview override** for `DATABASE_URL`, not a shared Preview variable. Keep `MARIPOSA_ASSISTANT_ENABLED=0`. Configure the synthetic `STOREFRONT_ORGANIZATION_ID` only on the candidate branch. Candidate code must suppress inherited storage configuration and enforce verified DB identity before any connection or auth read. Do not alter shared variables or the stable branch.
5. Wire the reviewed scope into history route/service authorization and pass server-resolved capability props to `HistoryControls`. Do not globally flip either release constant or introduce a `NEXT_PUBLIC` bypass. History handoff must call existing `createInquiryRecord` through the existing history service, while ordinary public intake remains closed. Re-check tenant/member per request; keep existing cookie, CSRF, expiry, quota and publication checks. Owner LLM smoke remains separate and disabled.
6. Present that concrete diff/manifest for approval before any deployment or remote schema/seed action. Secure test login must use existing auth/session services and synthetic OWNER membership; no new auth bypass or token printed to logs. If schema is missing, separately approve applying only the existing migrations to the verified test resource. No paid resource creation is included.

## E2E acceptance sequence

Existing services and harnesses are reused, not replaced. Previously recorded results in `ASSISTANT_ISOLATED_INTEGRATION_20261017.md` are 12 SQL/service, 8 actual Next HTTP/proxy and 7 browser checks. Those are local evidence, not cloud/full-flow acceptance.

| Stage | Concrete check / evidence | Execution status |
| --- | --- | --- |
| Offline policy/seed | `node scripts/isolated-preview/check.cjs`; negative scopes plus typed seed relations/prices | Executed in this checkpoint |
| Consultation/context | Existing `assistant-full-run-regression.cjs`, `assistant-restored-selection-targeted.cjs`, `assistant-comparison-presentation-test.cjs` | Offline scripted provider only |
| Real persistence | Existing `assistant-history-isolated.cjs --allow-isolated-history <approved-local-runtime>` | Prior f7fadb4 evidence; loopback DB only |
| Real Next ownership | Existing `assistant-history-http.cjs --allow-isolated-history-http <fixture.json>` | Prior f7fadb4 evidence; loopback DB only |
| Browser handoff | Existing `assistant-history-browser-targeted.cjs <loopbackURL> <fixture.json>` | Prior f7fadb4 evidence; component fixture |
| Candidate initial state | Actual showroom at 390/430/1440; one period picker; Apply/Cancel/Clear/Escape/reopen; no consent means zero conversation/Inquiry writes | Pending isolated candidate |
| Context/comparison | Two seed dresses, favourites/selected items, follow-up colour/price comparison; preserve dates/height/colour, height is not guaranteed size; reject unpublished and foreign IDs | Pending whole UI test; no live LLM claim |
| Durable handoff | Explicit history consent, refresh, separate contact + confirmation, double-click, lost committed response/retry; exactly one Inquiry/item set/audit, no order/fitting/capacity changes | Pending candidate; prior local component proof exists |
| Staff receipt | Existing synthetic OWNER login, actual Inquiry detail/transcript; other tenant/expired session denied; read DB counts separately from UI | Pending candidate |
| Revocation/retention | Revoke removes conversation/messages but retains transferred Inquiry; expiry and conflict handling | Pending candidate; prior local proof exists |
| Closed scopes | Same source with absent approval, wrong project/ref/tenant, live DB or production rejects before DB connection; inherited key never invokes model | Pending runtime wiring + integration test |

Do not run the old `assistant-history-fields-e2e.cjs` as proof: its disposable-copy gate patches and date selectors are stale. It needs adaptation to the compact period picker/current access module before whole-flow execution. Test-only scripted responses must stay in the local test harness with a visible synthetic label; never ship a simulated assistant as live AI. No new paid model run is part of this preparation.

## Next concrete unblock

Owner supplies only the nonsecret `Mariposa test-1` project ref/dashboard identity (or grants the existing connector read access to it). Then verify isolation read-only and complete the scoped runtime wiring. Only afterward request the separate secure credential/configuration and deployment approvals. **Current package is reviewable preparation, not deploy-ready.**

References: [Vercel branch-specific Preview variables](https://vercel.com/docs/environment-variables#preview-environment-variables), [Supabase environment management](https://supabase.com/docs/guides/deployment/managing-environments). Supabase changelog Markdown fetch returned an unsupported content-type error; no cloud schema changes were attempted.
