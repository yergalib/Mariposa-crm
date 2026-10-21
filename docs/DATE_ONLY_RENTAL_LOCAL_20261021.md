# Date-only rental implementation — local checkpoint, 2026-10-21

Supersedes DATE_ONLY_RENTAL_DECISION_20261021.md. Owner confirmed: normal pickup15:00–20:00, return next day by12:00 for one day; exceptions require staff. No pricing change.

Implemented policy:
- Client chooses pickup date + duration or return date.22–23Oct means pickup22Oct and return23Oct; two days from22Oct means return24Oct.
- Shared rentalPeriod validates civil dates and maps to [pickup-date15:00,return-date12:00) in branch.timezone. Existing availability engine applies its current turnaround buffer; its exact bookings/allocations are unchanged.
- Today before20:00 is allowed. Even after15:00 its check still begins at15:00, conservatively detecting existing occupancy; after20:00 today is rejected with staff-agreement guidance. No invented exception or automatic reservation.
- API accepts date-only or exactly canonical standard timestamps; arbitrary rental times are rejected. Old CRM bookings are not rewritten. Old nonstandard tab periods require reselection and are not labelled as a newly agreed standard interval.
- No per-day pricing multiplier introduced; catalogue price/quantity behavior unchanged.

Website/assistant:
- Catalogue/product calendar now has dates and duration, no clock controls; one trigger/apply/cancel/clear retained. Chat period editor and older guided/selection date controls use dates.
- Assistant resolves tomorrow/day-after/today + duration, explicit date+duration and22.10.-23.10 without asking clocks. Confirms actual pickup/return dates and standard conditions. Height is not size; original event/colour/preferences persist. Early/late/explicit clock exceptions are referred to staff without changing period or showing a promised booking.
- Inquiry payload, text, handoff and history use the same standard period. Fitting visit time inputs and internal actual issue/return timestamps are untouched. No real inquiry created.

Final checks PASS:
- showroom-date-only-targeted:32 offline scenarios; API date normalization, inquiry schema, preserved fitting datetime, today before/after20:00, invalid dates, month/year boundaries, 1/2days, exact22–23, nearby occupancy and turnaround0/180/181min; actual assistant/CRM-tool fixture path, no provider calls.
- assistant-dialogue-variations-targeted:32 cases (date-only successor of31 clock-era cases),24 scripted provider replies. Negation/uncertainty, conflicting ranges, height/size, budget/exclusion continuity, anycolour and noresults retained. Requests for clocks now test staff exception instead of supplying hours.
- assistant-relative-period-regression:branch midnight, exact original autumn-ball dialogue, restored fixed dates, exception rejection, no height-to-size inference.
- assistant-recovery-targeted:13 cases; full-run dialogue regression; owner-day9 guard groups including synthetic inquiry idempotency and expiry rollback.
- availability-batch-targeted:48 variants compared, unchanged core capacity semantics; tab-state regression; calendar apply/partial/cancel/clear; assistant calendar/editor/cancellation and inquiry duplicate-click UI harness; draft summary; colour regression.
- typecheck/lint/build final PASS. Changed TS/TSX files also linted together.
- Browser at390/430/1440 using real root+showroom+calendar CSS, synthetic local page: no clock controls, dialog within viewport, native Escape restores trigger focus, reopen/cancel/clear. PNGs visually inspected under docs/evidence/date-only-20261021/. Browser is isolated Edge profile, no user tab/session used. These are local component screenshots, not a published/live model acceptance.

No push/deploy/alias, DB writes, paid calls, smoke, environment/key/access/window changes. Vercel403 remains the publication blocker. Live model paraphrase quality remains unverified; fixtures are not training or proof of live model quality. Main catalogue price/stock/customer data never changed here.
