# Client Telegram readiness — LOCAL ONLY, 22 October 2026

Current release remains3b8671c, owner-only. No deployment, settings, webhook, schema, customer messages or paid calls performed for this proposal. Existing uncertain sending does not hold the active-turn index; never replay it or invent a delivery receipt.

## Confirmed gaps
1. config.ts accepts owner-test-v1 only. Binding/enrollment requires an actual OWNER session, and a unique enabled binding per owner prevents many customers. Removing this check would impersonate staff, not implement customer authorization.
2. Store scoping already includes tenant/bot/chat/generation and update hash, but authorization requires OWNER membership. Customer history/checkpoints need their own principal, not a fabricated membership or shared owner chat.
3. provider-budget.ts aggregates by organization+membership and serializes by organization lock. Keep a single existing billing envelope for WEB/owner/customer combined; never give each customer a fresh$10. Public identity must be separate from billing authorization. Immutable receipts/reserves and the one previously approved unknown exception remain unchanged.
4. pressureLimit is per-process only. It cannot enforce durable per-customer limits across Vercel instances. Telegram's current single connection also creates head-of-line blocking when returning503 for a slow turn. Do not silently increase webhook connections.
5. Sender authentication does not mean consent to OpenAI/history. A versioned private-chat onboarding consent is required before model access. No groups, forwarded third-party identity, contacts or customer list reads.

## Locally prepared
customer-policy-candidate.ts is deliberately unimported by live routes. It defines a server-pinned tenant/bot/branch and private-chat identity, consent, scoped key, Astana day, duplicate/conflict handling and admission rules. Offline tests cover isolation, false identities, consent, day boundary, global/per-user limits and retained unknown. This is NOT an implemented public endpoint or durable quota adapter. No claim of concurrent DB enforcement yet.

## Proposed exact public scope for approval
- Existing@Mariposaastana_bot and existing exact POST callback hostname/path; no new bot, token, hostname, WAF exception or Production change.
- Anyone may start a private chat, accept the displayed OpenAI/history notice and select a server-published MARIPOSA branch. They receive only published product details/prices and live availability. No CRM login or staff role, private customer/Inquiry/history lookup, order creation, payment or stock mutation.
- Combined cap remains$10 and100 provider calls/day Asia/Almaty, with full-turn admission and conservative pending/unknown reserves. Proposed user cap3new turns/minute,10/day,one in-flight turn; retries of the same update do not consume another turn or call. Quota refusal does not call AI. Bounded onboarding/error replies must also be deduplicated and rate-limited to avoid outbound spam.
- Existing cutoff2026-10-25T19:00Z remains. Continuing afterwards needs a separate duration decision; public scope does not imply unlimited duration.
- Publish explicit client mode only AFTER complete isolated two-chat tests and approval. Main CRM/showroom access controls remain unchanged.

## Required implementation/schema before activation
Add three private service tables (SQL candidate to be reviewed before applying): customer principals(consent version/time,tenant,bot,user/chat,branch,generation,enabled,expiry); customer turns(principal FK,update/hash,envelope,phase/checkpoint,result/history,delivery state/receipt,expiry,unique update and active-turn index); durable quota buckets(principal+Astana day/minute,accepted counts). RLS enabled, no anon/authenticated grants; no edits to owner rows or business data. Add nullable customer-principal/turn attribution to provider attempts while preserving existing immutable pricing and receipts. This requires exact reviewed additive SQL and concurrency tests, not migration now.
- Extend common provider scope with a verified customer subject and a server-owned budget account; preserve owner authorization as its own variant. Global aggregate must include old rows and all new subjects under the same tenant budget, with atomic reservation under existing lock. Never substitute customer ID for membership or use an OWNER identity to grant catalog access.
- Introduce an explicit customer catalog authorization context scoped to approved published branch/tenant; reuse existing public DTO/search/availability implementation and shared planner/reviewer. No general CRM tool exposure or WEB-session imitation.
- Durable admission transaction: global budget lock then principal lock, verify consent/window, dedupe update, check quota/full-turn cap, persist claim. Every provider reservation still checks globalcap. Request-local counters are only supplemental.
- Two-chat integration tests: interleaved dialogues and corrections, cross-tenant/branch/checkpoint denial, concurrent same update once, parallel cap boundary, unknown costs retained, revoked consent, spam across processes, error/delivery-unknown no replay, no write tools. Reuse colour/date/child-context regressions. Current pure policy tests do not replace these.

## Activation approval requested only when runnable package is ready
Approve additive service schema, publishing the verified customer runtime and changing only the Telegram audience/mode to consenting private-chat clients under the caps above. This authorizes client-initiated OpenAI calls and Telegram replies; not automatic paid agent tests. Preserve secret/webhook/security configuration and owner-only main application. Roll back by disabling client mode; retain history/accounting, no destructive down migration. No data migration to Kazakhstan or any other region is included.
