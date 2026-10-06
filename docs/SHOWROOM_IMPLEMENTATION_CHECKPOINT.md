# Client showroom: shell, home and catalogue

## 2026-10-05: narrow-window menu fix

Parent reported a reproducible Preview issue at an ordinary 500px browser window: choosing Catalogue changed the route but left the native mobile disclosure open over the content. `MobileMenu` now closes the existing details element after a navigation link/button activation and on History popstate/hashchange. Native summary toggling, menu content and CSS remain unchanged; listeners are removed on unmount.

PASS locally: the new component regression (reopen/select repeatedly, same-route action, assistant button, simulated Back/Forward/hash and cleanup), home/journey regressions, TypeScript, scoped ESLint and synthetic-localhost Next build. This is not visual acceptance. Parent owns the supported browser recheck of the updated Preview; no device emulation was used. The previously reported desktop ~1165px catalogue/product/favorites pass applies to the earlier Preview, not this new local commit. Intake remains closed.

**Current release status:** public inquiry intake is closed in both UI and HTTP endpoint pending a separate KZ infrastructure / privacy and legal-text approval. Previously implemented submit/retry logic remains dormant. No real contact field is displayed in the current customer flow.

Owner resumed implementation without waiting for photos/prices (2026-10-01, parent handoff 12:54 UTC). Approved 10-page prototype remains the reference; the four benefit texts use the final owner revision, not the older PDF wording.

## Implemented locally

- `/showroom`: full responsive home, original brand asset, hero, occasion entry, public dress sample, benefits, rental steps, optional assistant, owner-provided brand story and Local/Astana contacts.
- `/showroom?view=catalog`: native GET search/pagination/category navigation; existing nested category work preserved. Optional branch/size/colour/date panel calls the existing public catalogue API. Leaf category selection is explicit for a parent category; no silent broadening. Results reuse size/availability cards and the inquiry-only form.
- Product links and back navigation retain browse filters. Existing product selection, tenant/publication filters, availability calculation, inquiry guards and PILOT assistant authorization/privacy gates remain in place.
- Occasion buttons put a predefined event into the assistant draft; no automatic request. Conversation opens without mandatory calendar. Optional explicit date/time selection and cancellation protection remain. This does not implement the future full AI scenario.
- Public contact facts: Local, Astana, Alihan Bokeikhan 25b, basement, daily 11:00–20:00, owner WhatsApp/Instagram/2GIS. No inferred ordinary-call number, entrance directions, booking slots or financial policy.

## Limits, not completed features

- No photos fabricated. Branded empty photo areas have accessible labels; real-photo desktop/iPhone visual QA remains required.
- Browse DTO has no price or size list: cards link to details with “Уточнить стоимость”. Exact sizes/prices/availability come through existing selection DTO/API after explicit criteria. No added pricing or availability backend.
- “Популярные платья” currently shows up to four public dress model/execution groups from the existing bounded browse result. No popularity ranking/statistics. Owner-curated selection still required before launch.
- Date selection supports exact size label, not inferred age/height. Occasion is assistant/staff context, not a catalogue matching claim. Price-range filtering is not exposed because the existing public browse contract has no such capability; avoid filtering only one page and presenting it as global results.
- Fitting scheduling, public photos and full approved AI remain subsequent stages. Favorites and product cards are implemented in the follow-up below. No fabricated policy links.
- Earlier unfinished login/conversation-storage work remains separate and is not claimed complete.

## Verification and release status

- `tsc --noEmit`: passed.
- `next build`: passed with process-local synthetic localhost database URL; no real DB access, migration, seed, install or credential changes.
- Full ESLint: zero errors, seven pre-existing warnings in CRM photo/navigation files; changed showroom files clean.
- Synthetic-only smoke checks: rendered home/catalogue, existing narrow public DTO and tenant/production guards, free conversation entry + optional calendar + cancel/stale-response protection, outfit selection and inquiry retry. No provider calls or actual writes.
- Built app started locally on loopback for HTTP checks: home renders without configured tenant; catalogue safely reports unavailability. This does not validate live PILOT data or full browser layout.
- No browser automation used to bypass the existing credential-observation restriction. No new screenshots or PDF. Public working Preview remains unpublished because the publication approval blocker remains active; no push/retry/alternate hosting route used.

Prior local changes were backed up outside the repo at `../site-resume-checkpoint` before this stage. Original checkout and separate CRM worktree were not touched.

## Follow-up: product detail and guest favorites

- Product detail has gallery-ready main/secondary photo areas. Current public DTO does not expose photos: no private storage URLs or internal photo API are used. Real photos remain a later public-contract and visual-review step.
- Explicit size/branch/rental-period selection reuses `/api/showroom/selection`. Changes clear earlier price/availability; cancellation and unmount abort reads and ignore late results. Back from an unsubmitted inquiry retains selected fields. Missing price has a working “Уточнить стоимость” action.
- Prebooking and fitting requests use the existing inquiry form, only after explicit submit. Fitting intent is saved in the existing request text, with separate customer labels; rental dates are not fitting slots. No schema or endpoint added. Existing idempotency and uncertain-delivery retry stay in place. No real inquiry was submitted during testing.
- Related sections contain actual public catalogue cards (excluding the current product) from dress / shoe / accessory categories when present. They explicitly describe neutral catalogue options, not computed similarity or outfit compatibility. Empty categories produce no invented cards.
- Favorites: ID-only versioned localStorage, maximum 12 model/execution references, 30-day validity, UUID/schema/length checks and deduplication. Failed browser storage is reported. No personal/contact/price/transcript data stored. Existing login/history work is untouched.
- Favorites page round-trips a bounded set of references through the existing server page and `publicProduct`, so names/sizes are reloaded under existing tenant/publication guards. Removed/unpublished items and transient read failures are distinguished without exposing diagnostics; users can remove saved references. URL sync waits for client hydration.
- Compare up to four variants of models by actual colour/execution and catalogue sizes. No uncomputed price/availability. “Помочь выбрать” opens the guarded assistant, retains links/IDs in its local comparison context and fills the draft with selected names; it does not send a model request or automatically select outfit items. Full structured AI comparison is not implemented at this stage.
- Favorites and product navigation use the existing `/showroom` route; no proxy exceptions, backend availability changes, new API endpoints, migrations, real API/provider calls or DB writes.

Validation: typecheck, showroom lint and production build with synthetic localhost DB configuration passed. Added mock-only favorites persistence/publication and product-interaction regressions; home, catalogue and optional-calendar/inquiry regressions also pass. Browser layout and actual PILOT data were not exercised. These checks are not visual acceptance; no public Preview or new PDF was published.

## Follow-up: contacts, fitting preferences and release gate

- `/showroom?view=contacts` renders only owner-supplied Local/Astana address, basement, daily 11:00–20:00 and WhatsApp. Instagram, WhatsApp and 2GIS are ordinary external links, without prefilled customer data, tracking query parameters or embedded map calls. The WhatsApp number is not promoted to an independently confirmed call number; no `tel:` link.
- `/showroom?view=fitting` allows optional preferred date/time as a transient local draft, explicitly not a slot list or confirmed appointment. Product fitting requests retain their selected product/size/rental period, clearly distinct from fitting time. Neither path collects contact details or sends a request in the current release state.
- The earlier PILOT tenant restriction alone did not prevent a real contact from being entered. `PUBLIC_INQUIRY_INTAKE_OPEN = false` now closes the public UI and endpoint. The endpoint returns 503 before parsing the body or calling the transaction service. No new schema, environment setting, consent checkbox or legal-readiness claim. Opening intake requires a separate reviewed release decision; do not flip it just to make a demo submit.
- Header/footer and rental steps link to fitting and contacts. Compact mobile footer includes catalogue, selection, rental explanation, fitting, contacts and favorites. Medium-width navigation uses the menu instead of squeezing desktop links.
- Mock-only route graph verifies home → catalogue → product → favorites → fitting/inquiry → contacts, back/query navigation, clean contact URLs, no invented call number/slots, no contact input, and closed intake before any body read or write. Existing idempotency/retry test uses an explicitly mocked future-open gate; it is not evidence that current intake is enabled.
- No browser visual acceptance was performed, and no attempt was made to bypass the browser restriction. External contact destinations were not opened or messaged. No live PILOT requests, migrations, real customer data, paid model calls, push, deploy or PDF updates.

Main site now has code for home, catalogue, product, guest favorites, fitting draft and contacts. Remaining release dependencies: supported publication approval; actual browser/mobile acceptance; public-photo rights and safe delivery contract; owner photos/prices and curated featured models; fitting workflow details (schedule/duration/capacity if scheduling is later added); KZ personal-data infrastructure and separately approved privacy/legal terms before real intake. Full approved AI is a separate subsequent stage and has not been started automatically.

## Follow-up: bounded state within one tab

- Shared versioned sessionStorage now retains branch/size/rental dates, selected variant ID, optional fitting day/time, up to four comparison references and the last eight synthetic chat messages/draft/context. Retention is at most 30 minutes after a write, capped by authenticated session expiry. Four fixed buckets, at most 14,000 characters each; schemas restrict the actual smaller payloads. No contact fields, credentials, cards, prices or availability are serialized. Sensitive-text detection also rejects obvious contact details in free text; it is not a legal/compliance guarantee or a general personal-data classifier.
- Server-derived opaque scope includes storefront tenant and authenticated tenant/user/session (or guest identity). Scope changes purge old state; logout clears it before the server action and the login page clears it again. New conversation cancels the active request, clears tab drafts and ignores late replies. Legacy unused chat namespace is cleared too. This is not cross-device, durable CRM or handoff history.
- Restore hydrates after the server snapshot; writes happen synchronously on user events, without a save-on-unmount race. Reloaded product/catalogue criteria do not restore availability. Current public option/branch lists reject missing IDs; comparison products still pass through `publicProduct`. Chat cards are never restored, historical assistant prose is collapsed and labelled outdated. An explicit restore action rechecks selected variants through existing guarded CRM reads without a model request; no automatic provider calls on reload. Synthetic confirmation is not persisted.
- The public inquiry gate remains CLOSED for every HTTP caller, including synthetic PILOT. Internal `/chats` action/service remains separate. Mock tests can exercise future-open retry behavior; they are not a runtime intake bypass.
- Validation: synthetic storage/hook regression covers reload, malformed/versioned/expired data, contact/extra-field rejection, absent branch/variant, new-dialog cancellation/late replies, logout and user-switch stale writes. Existing route, catalogue, product, favorites, calendar and outfit mocks remain the regression baseline. Browser/mobile visual acceptance, live DB and paid-provider checks are NOT RUN under the current restrictions.
- Completed locally: eight showroom mock suites, the separate mocked internal CRM action/service scope check, TypeScript, scoped ESLint (zero warnings/errors) and Next build with a synthetic localhost DB URL all passed. Restored comparison IDs have neutral links until public product data is revalidated; saved names/prices are not reused. No public-intake bypass, new endpoints, migrations or provider integrations were added.
