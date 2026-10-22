# Inline checkout — local only

Closes the command-only UX limitation of fab2f7048e62fb9b1c9287dfaae7f5995273957a. No publishing, live SQL, credentials, webhook changes, Telegram sends or provider calls were performed.

## Client path

The shared manager still understands the dialogue and reads catalogue facts. The transactional endpoint now uses Telegram inline buttons:

1. Verified response: **Выбрать вариант 1/2/...** and **Нужна помощь сотрудника**.
2. After selection: enter a phone or email in an ordinary message. The contact goes directly to the protected draft flow, never to the model. **Изменить выбор** cancels that selection.
3. Server refreshes product/date/price/availability and shows the summary/contact. Buttons: **Подтвердить заявку** and **Изменить выбор**.
4. Confirmation creates one Inquiry through the existing common transaction and returns its ID. No reservation, order, payment or stock operation. The existing exception path uses the same confirmation UI.

Clients need no /request or /confirm commands. The internal compatibility handler remains server-side; customer-facing guidance no longer advertises those commands. Free-text consent still uses the existing /agree and /stop controls, outside this checkout change.

## Binding and invalidation

Selection callback carries the exact completed source turn UUID and option index, not a product/price supplied by the client. Server verifies bot identity, private chat, sender, active customer consent/window/tenant, latest source turn, and the confirmed message receipt containing the buttons. Callback payload stays within 64 bytes.

Each selection has a fresh immutable UUID. Each request has its own immutable draft UUID and saved selection version. Confirmation requires the current matching checkout, exact summary message receipt and unchanged quote. Changing product, contact, dates/preferences or cancelling invalidates uncommitted revisions. Ordinary messages invalidate before model budget admission, including when the next model call cannot start. A per-principal update floor prevents an old selection button from reopening the old dates after that failure. Old message replay cannot move the update floor backwards.

Changed price/availability permanently invalidates the revision; returning to the former price does not revive it. Creation and receipt remain atomic. Concurrent/repeated confirmation cannot create two inquiries. Existing confirmed inquiries are never invalidated/deleted. Unknown prompt or summary delivery is not automatically resent. Callback acknowledgements only dismiss the Telegram spinner; retrying an acknowledgement never triggers model or Inquiry work.

New selection prompts are bounded by the existing configured minute limit in a separate checkout quota bucket. Identical repeated selection does not consume another prompt. Global provider budget remains $10/100 calls per Astana day, through 2026-10-25 19:00 UTC exclusive.

## Candidate schema and activation delta (NOT applied)

The unpublished request candidate now includes one extra private checkout table plus invalidation/version/update-floor fields. Combined customer package: **six new service tables**, existing provider-attempt attribution column and related candidate fields. All new tables keep RLS and revoke public/anon/authenticated grants. No backfill/deletion/business-data rewrite. Review the two candidate SQL files together; they have not been applied in any live database.

Future explicit activation also needs `allowed_updates: ["message", "callback_query"]` on the existing Telegram webhook. Same hostname/path, secret verifier, token and protection; no extra endpoint or new credential. Do not blindly call the existing connection helper and assume callbacks are enabled: its previous connected-state path does not change allowed_updates. Preserve pending updates, perform an authorized readback, and manually accept the buttons after deployment. This setting was not changed here.

## Evidence and limits

`telegram-inline-checkout-test.cjs`: concrete PGlite checkout/request SQL and real handlers, synthetic catalogue/record/network ports. Covers ordinary button/contact/confirmation path, wrong chat/message, stale and malformed callback binding, same revision retries, concurrent confirmation, price restoration, different-product invalidation, cancellation, new-date invalidation before model admission, uncertain prompt delivery, expiry, per-user prompt quota and anonymous-table denial. Related request/media/customer/owner/ingress regressions retained.

No live model-quality or Telegram UI acceptance is claimed. PGlite uses one connection, so concurrency tests verify transactional predicates/deduplication rather than production throughput. A genuinely unknown delivery remains a blocker for automatic replay, by design. No WhatsApp transport is activated by this work.
