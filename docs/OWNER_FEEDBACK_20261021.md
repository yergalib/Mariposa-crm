# Owner feedback: catalogue and relative rental period

Base: 9a57c0e90d3988a8f2be845c1126489777a84d3c. Preview only; existing owner-day guards, budget, model, secrets and inquiry logic unchanged.

Changes:
- Hide the IANA label in catalogue copy; retain branch timezone for every calculation.
- Pagination has arrow buttons, visible disabled endpoints, focus and 48px touch targets.
- Verified availability is bold green/red with a symbol. Failed reads clear the previous status and remain errors, not unavailability.
- Resolve the explicit request “размер 90. платье нужно на завтра на 1 день” into branch-local civil dates, retaining the explicit label size and event. Ask only missing pickup/return hours. A draft date is not availability and contains no invented hours. Separate clock replies and restored context preserve the resolved dates across midnight. Current CRM search still supplies product facts only after a complete validated interval.

Code diagnosis: consultation `remember` previously accepted date changes only when `localDateTime(quote)` equalled the proposed ISO wall time. Relative dates cannot pass this test. A rejected change set returned the generic clarification and original context. This is a reproduced code path, not a claim to have recovered the exact model response from the owner's failed request. Semantic review and product grounding remain enabled.

Offline evidence:
- `node scripts/assistant-relative-period-regression.cjs`: PASS, exact dialogue, branch midnight, persistence, separate hours, explicit size versus height, colour/event continuity, branch mismatch and negative/ambiguous input.
- `node scripts/assistant-full-run-regression.cjs`: OFFLINE_PASS, existing consultation grounding/review/correction cases.
- `node scripts/assistant-owner-day-targeted.cjs`: PASS, nine existing owner/access/inquiry/budget groups.
- `node scripts/owner-feedback-browser.cjs`: PASS at 390/430/1440 px, actual React/CSS with synthetic DTOs in a separate headless browser. Zero POSTs; no user's browser tab touched. Final screenshots: local Temp `mariposa-browser-GSnnr3`.
- `node scripts/verify-owner-day-local.cjs`: typecheck/lint/build; see `docs/evidence/owner-main-day-20261021/verification.json` and logs. No live DB/model; TCP/TLS/fetch blocked.

Live read-only counter before changes: 8 provider attempts, including 1 activation smoke, zero active leases. No new smoke requested/performed.

Assistant panel redesign is PAUSED per owner's later instruction. Unpublished drafts are saved outside the repository in `../assistant-design-paused-20261021`; they are not included in this release. The one remaining ChatSelectionEntry edit only clears pending relative-date context when the user explicitly chooses a calendar period.
