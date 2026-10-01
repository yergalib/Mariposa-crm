# OpenAI consultant: authenticated PILOT Preview

## Implementation and activation

The flag defaults off in code. The owner has subsequently enabled Preview; future
deployments may inherit that setting. This fix makes no config change or paid call.

- Official `openai` Node SDK pinned at 7.25.0 (npm lifecycle scripts disabled on install).
  Responses API, model identifier `gpt-6-luna`, reasoning `none`, strict extraction
  schemas, `store:false`, fixed official endpoint, no retries and provider logging off.
- Butterfly opens the dialogue UI; the catalogue remains visible below. Previous
  deterministic component stays in source for regression/reference, not the main UI.
- Disabled/unconfigured state is explicit. No provider call is made on page load.
- Route requires actual active CRM PILOT staff session, CATALOG_VIEW, same origin,
  branch-only Preview gate and explicit synthetic-only acknowledgement. Vercel
  deployment protection alone is insufficient. Published branch access is also scoped
  to staff permissions; tool arguments cannot supply a tenant.
- The server reconstructs structured size/colour/local dates from all user turns.
  UI branch selection is server-validated against published staff-accessible branches;
  a sole branch is preselected. Assistant prose cannot introduce confirmed criteria.
  Explicit dates such as `02.10.2026 в 12 дня`, `04.10.2026 в 18.00` and
  `2026.10.02 12:00` are normalized internally, never requested as ISO from users.
  Ambiguous/missing dates are clarified. CRM applies the selected branch timezone.
- Complete criteria perform ONE server-controlled `find_dresses` search, without
  a model call. Incomplete requests may use ONE strict extraction call; excerpts
  must exist in user text and pass server parsing. No model-controlled tool loop.
  Existing CRM services retain publication/colour/availability checks. No write tool.
- Cards and links come from server-verified products returned in the CURRENT turn.
  Model-provided product prose/prices/URLs are not rendered as cards. Amounts stay in
  server UI DTOs; products are not sent to the extraction model. Recommendations and
  missing-field questions are server-authored. Prompt/data separation is not a guarantee of perfect model interpretation;
  synthetic live quality tests are still required.
- Contact fields, sessions, names/emails of staff, orders and internal notes are never
  serialized into provider input. Common contact/identity patterns are rejected.
  This is NOT a complete PII detector: authenticated testers must use only fictional
  scenarios. Real customer/child dataflow remains unapproved and out of scope.

## Enforced application bounds

Per HTTP turn: request body <=12,000 bytes; alternating user/assistant history <=9
messages, each <=700 characters, history JSON <=9,000 UTF-8 bytes; full provider
request JSON <=24,000 bytes BEFORE every call (bytes, not an exact input-token count).
Maximum 1 provider call, 1 CRM search, 600 output tokens/turn, 25-second deadline.
Oversized/incomplete/invalid responses fail closed. No automatic retry or tool loop.

Additional PROCESS-LOCAL protection: <=2 concurrent requests, <=4 requests/minute
and <=20/hour per staff membership per warm process, bounded 128-entry map. This does
not survive restarts or coordinate Vercel replicas. It is NOT a global quota or a
monetary cap. A distributed quota requires a separately approved shared store; none
was added. Resetting the UI does not reset the current process's staff quota.

## Manual activation — separate permission required

1. User creates a project-scoped OpenAI API key in their own OpenAI dashboard. Do not
   paste it into chat, source, browser JS, logs or screenshots. Restrict permissions to
   the Responses operation needed by this application where supported.
2. In Vercel project Environment Variables add `OPENAI_API_KEY` only for **Preview**,
   specifically branch **review/pilot-preview-rollout**. Never Production/Development
   or all branches. Keep `MARIPOSA_ASSISTANT_ENABLED` absent or `0` while preparing.
3. Confirm Preview Node.js runtime is >=22 (SDK requirement; local checks used Node 24.19.0). The assistant gate stays off on older runtimes; runtime settings were not changed. Confirm account access to `gpt-6-luna` and desired project spend controls. Balance
   top-up does not configure a cap. OpenAI spend alerts are distinct from enforced hard
   limits; documented hard-limit enforcement may still slightly overshoot.
4. AFTER action-time approval for paid synthetic tests, set branch-only Preview
   `MARIPOSA_ASSISTANT_ENABLED=1` and redeploy that branch Preview so settings apply.
   Existing STOREFRONT_ORGANIZATION_ID must remain the PILOT ID. Server also requires
   VERCEL_ENV=preview and VERCEL_GIT_COMMIT_REF=review/pilot-preview-rollout.
5. Sign in as an authorized PILOT staff member, then open /showroom and the butterfly.
   Confirm fictional test mode, submit ONE approved synthetic scenario, inspect token
   usage/cost and response. No automated first live call is part of this change.
6. Disable by setting the same branch flag to 0/removing it and redeploying Preview.

No key/settings changes, live API calls, DB writes/migrations, new publications,
Production changes, real customer traffic or new persistent store performed here.

## Verification

`showroom-chat-smoke.cjs` uses a fake SDK/provider and mocked CRM, with real network
blocked. Covers auth/flag/branch/origin/permission gates; input/privacy and context
limits; strict read-only tool dispatch; unknown variant rejection; trusted cards;
exact reported first/second/fifth-turn transcript without repeated questions;
natural local dates, corrections, branch context, model/output budgets; abort/timeout; process quotas/concurrency; SDK no-retry
configuration. Existing showroom/colour/inquiry regression scripts remain relevant.
Typecheck, lint and production build use a non-connectable dummy DB URL.
Browser and live provider verification remain outstanding; existing browser access
restriction is not bypassed. SDK/model account access is unverified until approved
live connection. `store:false` does not imply Zero Data Retention.

Official references verified 2026-10-01:
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/guides/function-calling
- https://github.com/openai/openai-node
- https://developers.openai.com/api/docs/guides/your-data
- https://developers.openai.com/api/docs/guides/spend-limits
