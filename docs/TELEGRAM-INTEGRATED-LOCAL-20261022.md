# Telegram integration — inactive local candidate

This document supersedes the unfinished-code list in TELEGRAM-ACTIVATION-APPROVAL-20261022.md. No deployment, live migration, real Telegram message, paid model call, secret retrieval, webhook change or photo work was performed.

## Connected local path

1. `/telegram` is an owner-only administration panel, not the public chat design. It is 404 unless the explicit Telegram mode, exact existing owner-day Preview configuration, expected bot ID and both secrets are present. Token storage alone does not activate anything.
2. `/api/telegram/enrollment`: real existing WEB OWNER session and same origin. Creates a short-lived random enrollment challenge, stores only its hash and the current session identity. A private `/start` command can claim the challenge but cannot activate the binding. The owner sees the numeric Telegram sender ID and confirms consent in the authenticated panel; only then is one owner/bot binding created. Repeated confirmation returns the same outcome. No old binding is overwritten.
3. `/api/telegram/webhook`: constant-time verifier check, bounded JSON, pressure limit, private text updates only. Unknown/unbound senders get no response/model call. Approved sender resolves an exact MAIN membership/branch binding. No browser session is fabricated.
4. `catalog-context.ts`: request-local AsyncLocalStorage capability, fresh OWNER/binding checks at each catalog entry. Existing catalog code and publication/color/availability rules are reused; branch constraints use AND so a caller cannot overwrite the bound branch. Outside that explicit context the original WEB session guard remains. Public photo code and image associations are unchanged; Telegram renders text, no image sending/import.
5. `runtime.ts` connects the actual shared planner, CRM tools, reviewer, checkpoint repository, history and common budget ledger. First webhook phase stores the planner output and returns retryable status; subsequent delivery of the same update claims the reviewer once. Telegram's normal retry is used as the phase trigger, not a new service or unbounded background process. Unknown/expired work never automatically restarts planning.
6. `/api/telegram/resume` permits the current WEB OWNER to finish an EXISTING scoped checkpoint only. Operator state is read-only; unknown/blocked results cannot be cleared through this page. Complete results refresh catalog facts with stored review verdict, not another model call.
7. Plain-text delivery includes validated facts, cards, sizes, date/return, current verified price and availability caveat. Uses the repository's whole-currency formatter (amountMinor here is historically whole units). No automatic resend after an unknown Telegram send or missing receipt.
8. `/api/telegram/handoff`: authenticated owner preview/confirmation, canonical draft hash, current published variant/tenant/branch validation, server-derived names/sizes, date-only normalization, shared Inquiry record creator, transaction lock, quotas and durable idempotent receipt. Contacts stay outside model/checkpoint; only the Inquiry stores the approved reply contact. This is a staff-selection request, not a quote/booking/order/sale/payment/stock mutation. The preview says price and availability are confirmed by staff; client prices are not accepted. Changed draft invalidates confirmation.

## Explicit activation gates (unchanged externally)

- `MARIPOSA_TELEGRAM_MODE=owner-test-v1` — currently NOT set by this task. No mode means all new HTTP routes return 404 before DB/network work.
- Existing token: `MARIPOSA_TELEGRAM_BOT_TOKEN`, Secret, Preview ONLY, branch `review/ai-header-preview-candidate-20261011`. Owner later reported saving. Fresh metadata-only inspection found TWO sensitive entries: one Preview-wide (no gitBranch), one for the exact branch. This is broader than approved; no values read, edits/deletes or Telegram calls performed. Broad duplicate must be resolved explicitly before proceeding.
- `MARIPOSA_TELEGRAM_BOT_ID` must come from verified getMe, and match token prefix. Not guessed or set.
- `MARIPOSA_TELEGRAM_WEBHOOK_SECRET` remains absent/uncreated; approval for its creation, safe ingress and webhook registration is still required.
- Existing $10/100 calls per Almaty day and exclusive cutoff 2026-10-25T19:00Z remain authoritative. Telegram receives no separate budget.

Settings URL verified from team slug/project metadata: https://vercel.com/mariposa-crm/mariposa-crm/settings/environment-variables . Secret entry is by the owner directly; no token in chat or browser address bar. No Production/Development/All Environments scope.

## SQL candidate and verification limits

`docs/sql/telegram-owner-candidate.sql` is now THREE additive tables: bindings, turns and short-lived enrollment challenges. This expands the earlier two-table proposal only in the local candidate; no schema approval/application is presumed. Includes RLS without public policies/grants, unique owner/bot binding, update deduplication, active-turn lock and delivery receipts. Minimal normalized update envelope is retained to allow owner resume without raw log access; privacy validation runs before insertion. No contacts/secrets/full Telegram payload is stored in checkpoint or envelope. Ten minutes is usability expiry only; no delete/cleanup occurs.

PostgreSQL SQL execution is not proven: no local postgres/psql executable or listener at the repository's isolated fixture port 62317 was found. No package/service was installed and no live DB was used as a substitute. Before any working-DB migration, run this candidate against an approved isolated PostgreSQL instance, verify constraints/transactions/advisors, and obtain explicit schema approval. Fixture tests are not a substitute for that check.

## Verified offline evidence

- `telegram-chain-test.cjs`: actual shared recordTurn/reviewRecordedTurn + CRM tool pipeline with scripted provider, staged webhook/review, preserved tomorrow/one-day/140 context, honest no-result reply, history, exactly one mocked delivery, no model replay on duplicate/resume, actual Inquiry validator and shared record helper with synthetic transaction, confirmation and receipt.
- `telegram-catalog-enrollment-test.cjs`: actual catalog service WEB fallback remains; two concurrent Telegram contexts isolated; bound branch enforced; revocation and foreign tenant deny without WEB fallback; command alone never activates; authenticated owner confirmation creates one synthetic binding; revoked session denied.
- `telegram-adapter-test.cjs`, `telegram-handoff-test.cjs`, `telegram-network-owner-test.cjs`, `telegram-delivery-test.cjs`: closed gates, bad actor/chat/bot, scope/window, concurrent claims, changed draft, sensitive text, unknown/expiry, redacted transport errors, no redirects/retries.
- `assistant-owner-day-targeted.cjs`: existing owner-day session, catalog/photo/history, Inquiry and ledger guards PASS, no live model calls.
- Typecheck and affected lint PASS. Full lint PASS with 0 errors / 7 pre-existing warnings. `node scripts/assistant-isolated-build.cjs` PASS, network guard on, blocked network attempts 0, no env files read, synthetic loopback DB only. This proves compilation/static generation, not live SQL/Telegram.

External steps left: owner secret entry and permitted read-only identity/webhook inspection; isolated PostgreSQL validation then explicit additive schema approval; exact ingress/verifier/webhook approval and inactive candidate deployment; authenticated owner enrollment/consent; separately approved private live acceptance tests and any actual test Inquiry. Do not represent this offline package as a live Telegram acceptance test.
