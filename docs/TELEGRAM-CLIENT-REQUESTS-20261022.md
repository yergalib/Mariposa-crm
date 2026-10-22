# Local client-manager package — no activation

Supersedes the consultation-only target in TELEGRAM-CUSTOMER-PACKAGE-20261022.md. The ordinary endpoint is a client-confirmed Inquiry, not a mandatory conversation with the owner. No live schema, deployment, setting, message, model call or business record was changed during this work.

## Implemented path

The existing shared planner/tools/reviewer retain child size versus height, colour, occasion, local dates, duration and grounded catalogue results. Shared business context now explicitly progresses toward a concrete choice, leaves staff for exceptions, and keeps contact/confirmation outside model messages.

Customer delivery preserves verified text and sends existing approved, execution-specific derivative bytes through Telegram multipart upload. It never fetches a model-provided URL, publishes a storage URL, creates a derivative or changes image associations. Text and media have separate durable claim/receipt rows. An uncertain part is never automatically resent. A photo missing from the authorised catalogue cannot be invented.

The final transactional UI is explicit commands, not autonomous model writes:

1. Numbered verified variants appear with the response. `/request 1 phone_or_email` selects the corresponding variant of the latest completed reply, its exact dates, and the contact. The contact stays outside provider input and model history.
2. Server checks current tenant/publication/branch, rental prices, capacity including existing turnaround buffers, and the approved 15:00–next12:00 date semantics. It shows the actual variant, date, catalogue price, availability and no-reservation disclaimer.
3. `/confirm <draft id>` explicitly authorizes creation. The authenticated chat owns that draft. The server rechecks the quote, creates through existing `createInquiryRecord`, and writes the receipt in the same transaction. Changed price/availability needs a new reviewed draft. Repeated confirmation returns the original ID.
4. Existing CRM receives source TELEGRAM, items, size, dates, contact, verified summary and the last five saved dialogue pairs. It enters existing NEW inquiry visibility/notification rules; no fake employee actor, order, allocation, payment or cash movement.
5. `/handoff phone_or_email` prepares an exception request with dialogue history and no fabricated product/date/price. Separate explicit confirmation is still required. Normal requests do not need owner enrollment or owner approval per customer.

Contact is stored in a private draft when the client uses the request command; the Inquiry is created only after confirmation. A phone/email pasted into ordinary conversation receives a protected-flow instruction before the model or checkpoint sees it. Draft expiry prevents new creation; it does not delete history or committed receipts.

## Additive candidate and access changes for one approval

Apply the previous `telegram-customer-candidate.sql` (3 tables and nullable ledger attribution) plus `telegram-customer-requests-candidate.sql` (2 additional private tables: request drafts/receipts and delivery parts; one offered-reference column on customer turns). Total 5 new service tables. RLS enabled; no anon/authenticated grants; no business data backfill/deletion. The request table stores contact and a bounded transcript snapshot; these are additional personal data storage, not just technical counters.

Then publish the tested package to the same protected Preview and Telegram-only hostname and set the previously proposed customer configuration plus `MARIPOSA_TELEGRAM_REQUESTS=confirmed-v1`. Customer configuration fails closed without that explicit flag. Existing token/verifier/webhook/WAF/Protection remain unchanged. Audience changes from enrolled owner to consenting private-chat clients; no private CRM read access. Proposed configurable per-client limits remain 3 model turns/minute, 30/day, plus 3 draft requests/hour/client and existing 30 inquiries/hour tenant, 3/contact/hour. Shared $10/100 provider calls/day and 25 Oct 19:00 UTC cutoff remain unchanged. No automatic paid test is included.

Disable customer mode to roll back activation; retain tables, history, receipts and created inquiries. Never remove a saved inquiry or release unknown spend as rollback.

## Acceptance and evidence boundaries

Ordinary path: child size/height + yellow + tomorrow/one day -> grounded selection -> exact execution photo/price/date -> choose -> contact -> review -> confirm -> one TELEGRAM Inquiry + ID + existing staff queue, without owner intervention. Confirmed Inquiry is NOT a confirmed reservation.

Exceptions: no exact colour/size, missing photograph, unavailable stock, changed price, exceptional pickup/return time, unknown tool result, explicit human request. Preserve preferences, disclose the specific gap, and offer exception request; never silently substitute champagne/gold for yellow or promise an exception.

Tests: shared planner/reviewer and owner/customer chain; channel confirmation transactions; concrete PGlite request SQL/command path; real rental quote policy with synthetic stock port; multipart media with synthetic network. Includes isolation, revoked consent, unknown delivery, changed quote, atomic rollback, concurrent duplicate confirmation, history/channel and no billing-owner impersonation. PGlite serializes one connection: not a production concurrency/load proof. Model and Telegram responses are mocked. No live acceptance or demonstrated 30-minute saving is claimed.

Remaining UX limitation: the final selection/contact/confirmation uses explicit commands; it is not yet a natural-language or inline-button checkout. Operational exceptions are explicit `/handoff`, not a claim that a staff member has read/responded. Missing source photos and real model behaviour remain data/live acceptance limits. The package should not be described as fully accepted WhatsApp-like conversational UX solely from these offline tests.

## WhatsApp transport

Not connected. Reuse the shared manager, quote/confirmation and CRM persistence through a WhatsApp adapter with its own verified identity, webhook signatures, message deduplication, receipts and media handling. Requires an approved Meta WhatsApp account/business phone number, secure access token and webhook/subscription configuration, with applicable messaging-window/template and billing decisions. None is created or authorized by this Telegram code change.

Official references checked read-only: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started and https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview .
