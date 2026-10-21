# Date-only rental: decision required before availability changes

Requested scope: website catalogue/product/inquiry, assistant dates and filters, API validation and inquiry text. Excludes fitting appointments, internal issue/return timestamps and existing CRM reservations. No publication or live writes.

Evidence from current implementation:
- lib/availability/interval.ts preserves exact requestedFrom/requestedUntil, adds existing turnaround minutes to blocked end.
- lib/availability/batch-read.ts uses strict half-open overlap: blockedFrom < requestedUntil and blockedUntil > requestedFrom. Existing exact bookings must remain exact.
- lib/orders/list-filters.ts explicitly excludes end of a query period; this is a query convention, not an owner-approved rental-day rule.
- lib/orders/management.ts computes gross = unitPrice * quantity; no day-rate multiplier. Catalogue price cannot safely be relabelled per day or multiplied by chosen duration.
- lib/showroom/period.ts and service.ts currently require future exact times. Midnight today would be rejected although a date-only today request may be intended. Needs civil-date validation, not hiding time inputs.
- relative-period.ts currently maps start+Ndays to a return-date draft while asking clocks. That earlier implementation is not evidence of an owner-approved no-clock occupancy policy.

Unresolved business choice (must not silently decide):
A. Dates are inclusive days of use. One day on22Oct means only22Oct; two-day22–23Oct includes both. Internal occupancy [22Oct00:00,24Oct00:00) for the two-day range, converted in branch timezone; existing turnaround still applies. This does not promise physical pickup/return at midnight.
B. Start and return dates. One day starting22Oct means return23Oct. With no return time, blocking only until23Oct00:00 is unsafe for a morning23Oct booking. Conservatively including the entire return date blocks [22Oct00:00,24Oct00:00), plus turnaround, but reduces availability and must be an explicit business choice.

Example proving the distinction: existing reservation23Oct10:00–12:00 does not overlap [22Oct00:00,23Oct00:00), but does overlap [22Oct00:00,24Oct00:00). Removing controls without choosing the semantics changes which products are offered.

Suggested owner question: Does one day on22Oct mean use/return on22Oct, or return on23Oct? If return23Oct without hours, approve blocking the return day too. For a typed22–23Oct range, explicitly specify whether both dates are occupied days. No policy selected or application calculation changed in this checkpoint.

Implementation after decision: one shared date-only normalization for server/API + assistant + URL/UI; retain separate human civil dates and internal exclusive interval; do not show internal midnight as promised pickup time. Update calendar trigger and fields, catalogue/product/inquiry validators, selection filters, assistant context/date extraction, handoff/history presentation. Keep fitting date-time and internal CRM records unchanged. Preserve current price semantics. Revalidate availability using existing exact overlapping bookings and turnaround.

Required tests after decision: tomorrow/1day;22–23Oct;Ndays; same day; end-of-month/year; invalid/leap dates; branch midnight; existing occupancy just before/start/end/after boundary; turnaround at boundary; old precise intervals unchanged; current-day request; no invented hours in UI/chat/inquiry; coherent catalogue→product→inquiry DTO; no real inquiry writes.

This is a decision/evidence checkpoint only. No date-only application implementation, no claim of scenario completion. Existing recovery checkpoint92aa6cc preserved. Vercel403 unchanged.
