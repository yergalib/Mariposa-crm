# Local calendar and fitting-error acceptance correction

Rental calendar now uses the selected visible branch timezone. With no branch selected it uses the common timezone of visible active branches when they agree; otherwise it explicitly uses the organization timezone for the shared calendar axis. Today, default anchor, day/week/month windows and display use that same choice. Today links and week highlighting share the query's captured Today date. An explicit date such as 2026-10-06 remains selected; Today navigates to the current branch-local date. Existing order intervals, ledger and availability algorithm were not modified.

Fitting create/update actions now return validation/conflict errors through form state instead of redirecting with error query parameters. The existing Inquiry controlled-form/useActionState pattern is reused. Controlled client/customer/staff/source/date/contact/comment/product values and the creation key survive an error; the native React action reset is prevented. Success still redirects. No PII is stored in URL or browser persistence. Existing overlap/version/permission services remain unchanged.

Validation:
- scripts/calendar-branch-timezone-mock.cjs: 5/5. Oct 7 UTC+5 starts Oct 6 19:00Z; week/month boundaries, explicit date vs Today, search/status/assignee/branch predicates, shared/mixed branch zones and empty/foreign scope.
- ../fitting-owner-feedback/calendar-browser-result.json: real isolated browser confirmed Today and day links preserve filters, and fitting Day/Week/Month modes render.
- ../fitting-owner-feedback/fitting-form-state-result.json: real server validation (21 items) retained all fields; existing overlap guard rejected the occupied slot without creation; changing only start time created exactly one fitting in the adjacent free slot with all original fields persisted. Test-only browser input waits for client hydration. Test records/sessions were cleaned up; immutable audit entries retained.
- Targeted ESLint and P0 assembly TypeScript check; no broad regression/build repeat.

Owner fitting was read only: 2026-10-07, Test Astana Second branch. Viewing path: /fittings -> Day -> 2026-10-07 -> branch -> Show. Fitting calendars already exist (List/Day/Week/Month); rental /calendar is a separate view and does not display fitting appointments.

No owner tab, password or existing session was controlled. No source fixture, Production, migration, push, main merge, deployment, env or WAF changes. These are local review changes only.
