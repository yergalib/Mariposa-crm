# Assistant context and handoff — local checkpoint

Extends b256c891; existing assistant-ui, public CRM tools, context engine and tab-state are reused. No live LLM or intake enabled.

## Model findings and persistence design

prisma/schema.prisma has Inquiry/InquiryItem and AuthSession (staff authentication). It has no Conversation or Message model; StocktakeSession is unrelated inventory workflow. Current chat storage is lib/assistant/chat/storage.ts plus showroom tab-state: scoped sessionStorage, 30-minute TTL, text/identifiers only, no saved availability. AuthSession must not be repurposed for conversation content.

Inquiry already supports organization/branch, requested period/size, requestText up to 2000 chars, multiple InquiryItems and tenant-scoped creationKey/hash idempotency. Handoff preferences fit that existing requestText; the closed intake renders them in InquiryDraft. No schema change is needed for this local handoff. Future durable conversation history would require a separately reviewed schema design (tenant-bound conversation, ordered messages, retention/deletion and an optional Inquiry link), isolated tests and explicit migration authorization. No migration or live data work was performed.

## Changes

- Opening a generic assistant link preserves comparison identifiers. Adding selected favourites keeps unfinished user draft text. Public comparison revalidation remains server-side, tenant-bound through createCrmTools; duplicate refs read once, empty comparison requests ask for selection.
- Answer context seeds period-editor fields. Existing engine preserves dates/height/colour across follow-ups; no height-to-size conversion.
- A local discussion draft exposes preferences and comparison links even with assistant off. It explicitly says no CRM inquiry exists. Selected outfit handoff passes the same bounded preferences into InquiryForm and its closed InquiryDraft path. No prices/availability/transcript/contact are copied into preferences.
- Future-enabled InquiryForm accepts success only from the route's explicit {ok:true} receipt (route emits it after submitPublicInquiry resolves). Malformed/empty success retains the same creation key/payload for retry, never displays accepted. Intake remains closed.

## Verification

Synthetic targeted suites cover comparison context/deduplication and empty selection, tenant/publication rejection, height not size, draft preservation and escaped SSR, no contacts or enabled submit, response receipt and identical uncertain retry. Browser calendar QA is separate. Final aggregate typecheck/lint/build logs recorded outside the repository. No provider calls, DB writes, env-file changes, deployment or paid smoke. Approved smoke checkpoint/scripts unchanged.

## Final evidence (2026-10-09)

- Calendar commit: d5e63808a171bb239eb10da323582310e790c2fa. Final synthetic browser screenshots/measurements: C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-browser-RYInu3. Catalog and product open-calendar PNGs at 390/430/1440 inspected; product typography and hint spacing now match catalog.
- C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-checkpoint-final-6Ha9oW: assistant-read-tools-smoke, showroom-calendar-ui-smoke, showroom-draft-summary-smoke, showroom-chat-smoke PASS. That run then stopped at the outfit suite's old wording expectation, before aggregate checks.
- C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-checkpoint-final-lBRZEu: corrected showroom-outfit-smoke, assistant-ui-tool-cards-smoke, showroom-tab-state-smoke, showroom-intake-gate-smoke PASS; final typecheck, full lint, Next build all exit 0. Build subprocess used a minimal environment with a dummy non-listening loopback DB URL. No env files edited.
- Initial calendar UI test harness required a next/image adapter because the existing mock window has no document; only the test adapter changed. New preservation assertion found a missing draft update, which was corrected before successful tests. No unresolved test failures.
- Remaining blocker is live activation only: authorised safe environment/provider key and a deliberate gate decision are still unavailable/out of scope. No credentials extracted, no paid calls, no enablement changes. Durable conversation DB persistence is design-only; current tab-local drafts remain explicitly unsent.
