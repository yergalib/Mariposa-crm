# Showroom UX checkpoint — 2026-10-10

Local continuation on `review/website-current-20261009`, based on AI checkpoint `42ee6549ca43591213e1a5faa61919faba69f670`. The AI checkpoint is retained unchanged. No push/deploy, photos/hero changes, database/schema changes, live inquiry, real LLM call, key access or environment-file change.

## User-visible behavior

- Active catalog search/category/color/size/branch/rental-period filters remain visible as outlined removable chips above the collapsed filter form. The count and full reset derive from the existing parsed URL. Individual resets retain unrelated filters and reset pagination. Removing a branch also clears its date pair, avoiding a branchless availability query. Partial periods have honest missing-date labels.
- A sole public branch is consistently selected in page queries, catalog form, product, chat and the older consultation form. Multiple branches require explicit selection; zero branches do not invent a value. The sole branch is shown as context with its timezone, not counted as a removable narrowing filter. Explicit invalid query IDs are preserved for existing server validation rather than silently replaced.
- The assistant close button says `Закрыть ×` and exposes `Закрыть помощника` to assistive technology. It closes the dialog without navigating. The separate `Открыть каталог` link actually navigates.
- Empty page 1 no longer renders pagination. Later empty pages retain a way back.
- `Запросить примерку` in the product opens an unsent visit-preferences draft immediately, without a chosen size, rental dates or availability GET. Optional visit day/time survive closing and reopening through existing tab state. Focus moves to the draft and back to product selection. No rental dates are presented as a visit requirement.
- Booking still requires a checked exact variant/branch/date selection. Existing cancellation, stale-response handling, URL criteria restoration and availability invalidation remain. Rental-period summaries remain in booking drafts.
- Closed intake and unavailable/restricted AI now expose the existing configured showroom WhatsApp URL directly. No invented contacts, prefilled personal data or automatic messages. The UI explicitly says the draft is not sent, not confirmed and not stored in CRM. Sending remains disabled.

## Server dependency and intentional boundary

The existing public inquiry contract currently requires `variantId`, `from`, and `until` for both purposes. `submitPublicInquiry` validates a rental period before writing. The schema already permits nullable requested dates, but defining a separate server visit-request contract and its public validation is a distinct persistence change. This dependency was explained before implementation.

This checkpoint separates the **currently available visit workflow** (local draft + existing showroom contact) from booking. It does not claim to create a period-free CRM inquiry. Intake remains closed at both route/service boundaries. The booking/selection schemas, public tenant/product/branch guards, price resolution, business color rules, API routes, authentication and gates are unchanged. A future release of actual visit submission must first define its server contract; no fake dates or bypass are introduced here.

## Verification

Final source-hash-bound evidence: `C:\Users\AMELIE~1\AppData\Local\Temp\mariposa-ux-final-j6XwH3` (`results.json`, per-check logs and `source-sha256.json`).

Targeted tests cover URL chip count/reset/dependencies, zero/one/multiple branches, preservation of explicit invalid IDs, booking/selection contract rejection without dates, immediate fitting draft, no premature request, cancellation/stale selection, restored dates/size, preserved booking summary, configured contact and closed intake rejecting before payload/DB access. The older isolated React test adapters were updated for the already-existing calendar component; calendar behavior is exercised by real browser components.

Browser evidence: `C:\Users\AMELIE~1\AppData\Local\Temp\mariposa-browser-fHoOuH`. Real React components and full global/showroom CSS in a fresh local headless Edge, synthetic DTO/API only; Next navigation uses the existing local adapters. Desktop/mobile widths **390, 430, 1440**. Captured filter chips, empty results, fitting draft and disabled assistant at each width. Screenshots were inspected, not only DOM assertions. No horizontal overflow, no browser exceptions, **zero POSTs**, **zero model/preflight requests**. Fitting and unchecked booking issue no availability request. This is local pixel/interaction evidence, not published-preview or real-CRM E2E evidence.

Final targeted suites, scoped ESLint, TypeScript and one isolated production build are recorded in the evidence directory. Build runs with an allowlisted system environment and a deliberately unreachable synthetic localhost database URL; it does not access the real database. React Best Practices review covered derived URL state, no new data-fetch effects, component focus and accessible actions. Existing theme colors and assets are preserved.
