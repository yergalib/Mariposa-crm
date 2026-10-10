# Local fitting request contract — 2026-10-10

Public fitting requests and booking inquiries now have separate strict validators.
Booking retains its required variant and rental period, period/timezone rules,
publication checks and normalized idempotency payload. Selection validation is
still derived from the booking contract.

A fitting request requires a public branch, one normalized phone/email,
creation key and empty honeypot. Rental dates are rejected. Interest can be absent,
one public model without a size, or one primary public variant plus up to two
additional variants. Model and variant IDs are checked against the bound tenant
and existing public rental publication policy; no availability or price is read.
An optional future local visit date/time is a wish, not an available slot.

Persistence reuses `createInquiryRecord`, the existing Inquiry/InquiryItem schema
and audit helper. Nullable requestedFrom/requestedUntil store no rental period;
model-only interest is a bounded text snapshot with the validated model ID and
no invented variant. The Inquiry keeps its NEW default. Request text explicitly
says the visit is unconfirmed and inventory is not reserved. No Fitting, order,
reservation, customer or stock mutation is introduced. No migration is needed.

Confirmed appointments remain a separate authenticated staff workflow in
`lib/fittings/service.ts`, unchanged here. Its existing 30-minute duration,
employee advisory lock and overlap check across branches enforce one concurrent
appointment per employee. This public request never invokes that workflow or
assigns a member/slot. CRM permissions are unchanged.

Existing tenant/Production guard, public branch guard, transaction advisory lock,
per-hour organization/contact quotas, idempotency and route origin/pressure/body
checks are retained. The release gate stays false. There is no existing explicit
consent checkbox or consent-record field in this public contract to reuse:
customer-facing legal texts and KZ personal-data infrastructure approval remain
the existing separate release prerequisites. This change does not claim to
resolve them or enable intake.

Validation (synthetic only):
- `node scripts/showroom-fitting-request-targeted.cjs`: actual service, validators,
  publication-policy helper, timezone parser and shared record helper in a VM;
  allowed in-memory Inquiry/audit writes only. Tests no-interest/model/variant
  requests, strict field separation, visit wishes, branch/product/variant policy
  predicates, rejected lookups, quotas, concurrent idempotency, booking legacy
  hash compatibility and tenant/Production guards. Unlisted DB methods and photo/
  availability access throw. Gate override exists only in the test VM.
- `node scripts/showroom-intake-gate-smoke.cjs`: actual closed gate rejects before
  reading contacts or DB.
- `node scripts/showroom-ux-contracts.cjs`: existing booking/selection regression.
- `node scripts/inquiry-reply-contact-mock.cjs`: 14 staff contact regressions.
- TypeScript `--noEmit --incremental false` and scoped ESLint pass.

No UI submission integration or full build repeated for this server-only change.
No real DB, CRM delivery E2E, network/model calls, secrets, environment changes,
photos, push or deployment. The current fitting UI remains a local draft/contact
flow while public intake is closed; this checkpoint alone does not send it to CRM.
