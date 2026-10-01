# OpenAI consultant: disabled Preview implementation

## Implemented, not connected

- Official `openai` Node SDK pinned at 7.25.0 (npm lifecycle scripts disabled on install).
  Responses API, model identifier `gpt-6-luna`, reasoning `none`, strict function/answer
  schemas, `store:false`, fixed official endpoint, no retries and provider logging off.
- Butterfly opens the dialogue UI; the catalogue remains visible below. Previous
  deterministic component stays in source for regression/reference, not the main UI.
- Disabled/unconfigured state is explicit. No provider call is made on page load.
- Route requires actual active CRM PILOT staff session, CATALOG_VIEW, same origin,
  branch-only Preview gate and explicit synthetic-only acknowledgement. Vercel
  deployment protection alone is insufficient. Published branch access is also scoped
  to staff permissions; tool arguments cannot supply a tenant.
- Only list_branches, find_dresses and check_variant exist. They reuse public CRM
  services and publication/colour/availability checks. Unknown IDs/tools are rejected.
  No order/reservation/inventory/payment/inquiry-write tool is exposed.
- Cards and links come from server-verified products returned in the CURRENT turn.
  Model-provided product prose/prices/URLs are not rendered as cards. Amounts stay in
  server UI DTOs; model tools get only priceKnown. Recommendations use server-authored
  factual text; model clarification questions are bounded and reject monetary/action
  claims. Prompt/data separation is not a guarantee of perfect model interpretation;
  synthetic live quality tests are still required.
- Contact fields, sessions, names/emails of staff, orders and internal notes are never
  serialized into provider input. Common contact/identity patterns are rejected.
  This is NOT a complete PII detector: authenticated testers must use only fictional
  scenarios. Real customer/child dataflow remains unapproved and out of scope.

## Enforced application bounds

Per HTTP turn: request body <=12,000 bytes; alternating user/assistant history <=9
messages, each <=700 characters, history JSON <=9,000 UTF-8 bytes; full provider
request JSON <=24,000 bytes BEFORE every call (bytes, not an exact input-token count).
Maximum 3 provider calls, 2 tool executions, 600 output tokens per call (<=1,800 output
tokens/turn), 25-second deadline. Oversized/incomplete/invalid responses fail closed.
No automatic retry. Exhaustion returns an explicit error and stops the loop.

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
model/output/tool budgets; abort/timeout; process quotas/concurrency; SDK no-retry
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
