# Customer Telegram package — local implementation, 22 October 2026

Supersedes the earlier policy-only readiness note. This package is NOT published, migrations NOT applied, current deployment remains owner-only3b8671c.

## Connected local path
Existing exact webhook + verifier -> customer-test-v1 config -> bounded private message -> server-pinned MAIN/Astana principal -> /start disclosure -> explicit /agree consent -> per-principal durable update/hash and quota claim -> existing recordTurn/tools/reviewer -> scoped checkpoint/history -> atomic send claim/receipt. /stop disables future model/catalog/delivery access without deleting records. Old /agree updates cannot reactivate a later stop. Customer catalog context is distinct from OWNER authorization; shared membership ID is used only as the existing server-owned billing envelope. Customers receive no staff/session privileges.

Shared ledger retains all historical WEB/owner/customer attempts under the existing account: same$10/100providercalls per Astana day, full-turn preflight, per-call transaction lock/reservation and verified settlement. Pending/unknown keeps full reserve; only the existing individually approved exception remains. New nullable attribution links an attempt to a customer turn, whose principal identifies the chat/tenant. No pricing or financial CRM changes.

## Exact additive SQL
`docs/sql/telegram-customer-candidate.sql`: three private tables assistant_telegram_customers, assistant_telegram_customer_turns, assistant_telegram_customer_quotas; uniqueness/active-turn constraints; RLS and revoked anonymous/authenticated grants. One nullable FK column telegram_customer_turn_id on assistant_provider_attempts plus immutable attribution trigger. No backfill, deletion, reset, RLS changes to existing tables, or business writes. Apply once through normal migration tooling after approval; rollback is disabling customer mode, retaining tables/history/receipts. Expiry prevents use, does not delete.

## Activation settings proposed (not applied)
Same Preview branch review/ai-header-preview-candidate-20261011, existing callback/bot/token/verifier and hostname. No WAF/Protection/Production/webhook change needed.
- MARIPOSA_TELEGRAM_MODE=customer-test-v1
- MARIPOSA_TELEGRAM_CUSTOMER_BRANCH_ID=1ae79fec-2d81-4085-982a-f7f7c64a53be (MAIN Astana; must readback active/published before enabling)
- MARIPOSA_TELEGRAM_CUSTOMER_MINUTE_TURNS=3
- MARIPOSA_TELEGRAM_CUSTOMER_DAY_TURNS=30
Limits are required config with bounded integer ranges; absent/invalid config denies activation. Thirty messages is a proposal, not approved spending: shared100providercalls/$10 may stop earlier. Ten messages/day is possible but restrictive for a single long dialogue. One in-flight turn/chat; no additional quota debit for identical retries. New-principal creation limited200/day; service notices limited3/chat/minute and60/tenant/minute, no model call. Static error/disclosure notices are deduplicated too.
Existing cutoff2026-10-25T19:00Z unchanged. Consent notice explains OpenAI and history. No deletion/retention schedule or region move is implied; current database stays where it is.

## Validation evidence
PASS telegram-customer-chain-test: concrete enrollment + SQL store + shared actual planner/reviewer, two clients, consent/stop/late agree, isolated context, one response/update, provider attribution, provider failure blocked/no replay, delivery uncertainty no retry. Provider and Telegram sender are simulated, no live calls.
PASS telegram-customer-store-test: PGlite SQL, duplicate concurrent claims, distinct chats/tenant denial, revoked consent, active-turn lock, transactional minute/day quota rollback, review/delivery CAS, unknown receipt, immutable attempt attribution, anon denial.
PASS existing owner chain/network/196negative ingress paths/116main-site comparisons, shared settlement-runtime SQL and turn-admission tests. Typecheck/affected lint/isolated build PASS. PGlite serializes transactions on one connection: this verifies actual SQL predicates/rollback but is not a multi-connection production load test. Live multi-user behaviour/model quality remains unverified.

## Operational limits, not hidden readiness claims
No customer Inquiry/order/payment path is exposed. Public data-only tools are reused. Budget busy/limit before acceptance returns a bounded notice without a provider call. An uncertain model attempt after acceptance blocks that chat and preserves global unknown safeguards; requires evidence-based operator diagnosis, never automatic repayment. Unknown delivery is never resent. Existing max_connections=1 and bounded deferred review are unchanged, so queueing under simultaneous clients still needs read-only observation after authorized activation; no latency guarantee is made. No live smoke or automatic paid test is part of activation.

## One approval request
Allow applying the above additive service schema and publishing/enabling customer-test-v1 for private chats of the existing bot, after explicit OpenAI/history consent, on MAIN Astana published catalog only, with3newmessages/minute and30/day per client, one shared$10/100providercalls/day through the existing cutoff. Existing bot/credentials/callback/security remain unchanged; no orders/payments/stock changes. Then owner/friends manually test. If approval differs, keep current owner-only mode and adjust only agreed config before activation.
