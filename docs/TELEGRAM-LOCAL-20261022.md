# Telegram owner-test: local, inactive package

No endpoint, token reader, env change, migration execution or publication is included. Owner has now confirmed bot ownership; current webhook remains unknown. An unwired network adapter and fresh OWNER resolver were added in the follow-up; see TELEGRAM-ACTIVATION-APPROVAL-20261022.md for the current exact status. Photos are outside scope.

## Implemented

- `telegram/adapter.ts`: authenticated-webhook helper, private-chat exact sender binding, explicit enablement/consent/window, namespaced principal, stable update hash, scoped checkpoint continuation, reviewed-only history. Incoming Telegram IDs never become a WEB session.
- `telegram/engine.ts`: existing recordTurn/reviewRecordedTurn, fresh CRM tools, common OpenAI provider and shared daily ledger, full-turn admission. No second model, pricing or prompt implementation.
- `telegram/store.ts`: parameterized transactional binding lock, unique update, conflict rejection, one active chat turn, compare-and-set review, no automatic reclaim of unknown/expired attempts, minimal continuity history. A completed turn still locks the chat until history is saved. Out-of-order unprocessed updates fail closed.
- `telegram/handoff.ts`: explicit confirmed draft, atomic receipt port and existing createInquiryRecord with enforced organization/branch/TELEGRAM source. Does not reserve stock, create a sale, pay or book. Confirmation hash must already be staged by a reviewed confirmation flow; arbitrary chat text cannot stage it.
- `telegram/delivery.ts` and store CAS: at-most-once send claim and receipt, uncertain send or receipt never automatically retried. Follow-up HTTP sender exists but is not wired or activated.
- `docs/sql/telegram-owner-candidate.sql`: exact additive SQL proposal, two new tables; WEB/history/ledger unchanged. RLS enabled, no Data API grants/policies. Disabled bindings by default. Expiry means unusable, not deletion/refund. No destructive down migration.

## Deliberately not wired / activation blockers

1. Confirm existing bot ownership; approved server-only use of existing token. Owner enters it directly in the selected project's protected secret settings, never in chat, source, client bundle or NEXT_PUBLIC variable. No key creation or rotation is proposed. Exact branch scope must be reviewed before saving.
2. With approval, server-side getMe/getWebhookInfo; record only bot identity and redacted status. Existing webhook/polling must be understood before replacing it; never drop pending updates.
3. Approve and apply candidate schema after actual PostgreSQL verification. This turn has not executed SQL even locally: database concurrency is represented by atomic fixtures and SQL review, not proven on PostgreSQL.
4. Supply the real membership/permission resolver to required `authorize`: recheck current active OWNER, exact MAIN tenant, allowed branch, explicit Telegram sender binding, consent and current owner-test window on every stage. There is no permissive default. WEB session impersonation is forbidden.
5. Wire validated public handoff input and owner confirmation UI to the transaction port; no caller currently stages a handoff hash. Thus the local package cannot silently create inquiries. Contacts stay out of model/checkpoint, and any future contact intake needs the existing consent/validation workflow.
6. Review narrow ingress under existing Vercel protection; no global WAF/SSO disablement or bypass secret in URL. Only after approval: inactive route, webhook-secret header, bounded body, rate limit, approved private chat allowlist, explicit synthetic owner test consent.
7. Outbound delivery remains unwired. Implemented durable states unsent→sending→sent(receipt) or unknown; claim before send, unknown must never auto-retry. Telegram sendMessage has no assumed exactly-once guarantee. Need reviewed delivery/worker trigger before activation; no new background service is authorized here.
8. Approve one private-chat activation and separately any paid test. Preserve existing shared $10 / 100 provider calls per Almaty day and cutoff 2026-10-25T19:00Z; do not create an independent Telegram allowance. Public users are out of scope.

## Verification

Offline adapter tests cover closed/default gates, wrong sender/group/bot, principal isolation, changed update payload, duplicate planning, concurrent review, wrong checkpoint, revoked access, unknown and expired outcomes, sensitive text rejection. Handoff tests use synthetic persistence only. Existing recorded-turn/review-continuation/settled-budget suites exercise the shared engine and ledger independently. No live bot, provider or business data calls.

Commands passed: `node scripts/telegram-adapter-test.cjs`, `node scripts/telegram-handoff-test.cjs`, `node scripts/telegram-delivery-test.cjs`, `node scripts/assistant-review-continuation.cjs`, `node scripts/assistant-recorded-turn.cjs`, `node scripts/settled-budget-candidate-test.cjs`, `npm run typecheck`. Full lint: 0 errors, 7 existing warnings; added files also lint clean. Standard Turbopack build fails on the existing external node_modules symlink. Isolated Webpack runner is used instead, with synthetic loopback DB and network guard; initial sandbox attempt hit EPERM creating `.next/types`, then retried through normal approved local execution.

Rollback before activation: leave code unreferenced and tables absent. After an approved future migration, disable transport and retain audit/history; do not delete tables or reset reservations.

Final build: `node scripts/assistant-isolated-build.cjs` PASS (exit 0), network guard enabled, blocked network attempts 0. Compilation/static generation only; not a live Telegram or PostgreSQL integration test.
