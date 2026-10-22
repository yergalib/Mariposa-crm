# Existing MARIPOSA bot: next approval, not activation

Owner confirmed ownership of @Mariposaastana_bot on 22 October. This does not authorize token storage, ownership transfer, webhook replacement or external replies. No bot transfer or photo work is included.

## Exact protected settings proposed

Project: `mariposa-crm` (`prj_FSsQxUktUBH9VNCGeadBoNnzlD1W`). Target only Preview / branch `review/ai-header-preview-candidate-20261011`. Do not select Production, Development, all branches or an organization-wide shared secret.

1. After explicit approval, owner opens Project Settings → Environment Variables and enters the EXISTING BotFather token directly as `MARIPOSA_TELEGRAM_BOT_TOKEN`, server-only protected secret (Sensitive option where available). Never send in chat, browser URL, source, logs, screenshots or any `NEXT_PUBLIC_*` variable. Do not create/rotate a bot/token. Merely saving it does not register webhook or enable this local package: no env reader or route is installed.
2. First allowed use should be only getMe/getWebhookInfo via the server. Confirm exact bot ID/username and whether an old webhook/polling integration exists. Return redacted status; do not print webhook URL, which may contain a secret. A configured old integration requires a specific cutover decision, not blind replacement.
3. For webhook activation, separately approve a new verifier value in `MARIPOSA_TELEGRAM_WEBHOOK_SECRET`, a server-only protected secret with the same branch scope. It is NOT another bot credential. This value has not been generated. It will be sent as Telegram secret_token and verified from X-Telegram-Bot-Api-Secret-Token; never place it in URL/query. No automatic webhook setter exists in this package.
4. Approved binding belongs in the proposed service table, disabled initially: exact MAIN org/OWNER membership, verified bot ID, owner sender/private-chat IDs, chosen published branch, consent timestamp, new binding generation and existing test cutoff. IDs must be verified through authenticated owner enrollment, not guessed from the username. Do not store credentials in this table. No public-user mode is proposed.

No additional OpenAI key, model change, quota increase or Telegram-specific budget is needed. Reuse the existing daily $10 / 100 provider calls, Asia/Almaty, until 2026-10-25 19:00 UTC exclusive. Token entry alone must not trigger any provider call.

## Minimum approval groups

A. Store and use existing bot token server-side on this Preview solely for identity/webhook inspection. Owner enters it directly; assistant never needs its value in chat.

B. Apply reviewed additive service schema and enroll the owner's verified private-chat binding/consent, with existing active OWNER/MAIN rights and expiry. No business records or membership changes. Verify SQL on an isolated PostgreSQL instance before applying; mocks do not establish DB concurrency.

C. Approve narrowly scoped webhook ingress plus verifier secret, registration/cutover only after existing webhook status is known, and outbound replies only to the owner's enrolled private chat. Keep website protection/WAF and all other endpoints unchanged. Reachability under Vercel SSO is unresolved; no global disabling or URL bypass secret is proposed. If a safe narrow ingress is not supported, stop and present that constraint.

D. Separately approve any actual paid test and any real test Inquiry. Current ownership acknowledgement grants neither. No real booking, payment, stock adjustment or public activation.

## Local adapters completed and remaining integration

- `owner.ts`: fresh DB checks of enabled binding, consent, exact MAIN/OWNER configuration, active organization/user/membership, existing effective permissions and active published branch. Does not synthesize an AuthContext or WEB session.
- `network.ts`: getMe/getWebhookInfo/sendMessage implementation with injected fetch for offline tests, fixed Telegram host, no redirects/retries, bounded timeout, plain text, exact private chat and bot-token identity, redacted failures. No function has been called with a real token.
- Confirmation: canonical draft hash bound to organization/principal/update; draft changes invalidate confirmation. Preparation validates inside a transaction and stages hash only; actual Inquiry creation requires confirmation, fresh validation and atomic stored receipt. Unknown delivery is not automatically retried.

Remaining CODE boundary, explicitly not hidden: common `createCrmTools` reads `showroom/service.ts`, whose tenant guard requires a WEB session; the photo path also retains its existing guards. A Telegram sender must not impersonate that session. Before activation, implement/review a narrow channel-authorized read capability for the same published catalog rules and a concrete validated handoff draft adapter. No live endpoint should be wired until these are tested. Existing WEB/photo guards were deliberately not modified in this task. Network adapters and confirmation primitives alone do not constitute end-to-end Telegram readiness.

Also outstanding: authenticated owner enrollment/confirmation presentation, webhook route body/rate limits, worker/resume trigger, and composed response rendering (cards/facts alongside model prose). These are required activation work, not solved by pasting a token. No new service or scheduled worker is selected or created.

Ownership transfer/phone question is separate: no transfer or account operation has been requested or performed here.
