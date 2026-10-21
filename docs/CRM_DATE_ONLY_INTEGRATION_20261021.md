# Local CRM/date-only integration

Branch: review/date-only-crm-integration-20261021. Base: 9cb33a263bff4537901f5ec62b4f4ae3eb127622.

Imported exactly cc5ca7b8c9ea44a2935aa13c51d0957d80fe954c and 73e3d1e3aa1b522e3d3fadee2f3caf1edb60636b from the supplied local bundles (local commits 35c14b0 and 431b78d). Did not replay e347/29b03b2. No SALE worktree touched.

Conflicts resolved:
- Inquiry detail keeps the compact primary action, request facts, conditional conversion, and the newer consented conversation read/render block with its expiry and unconfirmed-price/availability warning.
- Orders retains current quick filters, per-column pagination, status totals, calendar/export navigation, and adds the permission-checked create-order link from the CRM UI change.
- No integration diff in lib/, prisma/, app/showroom/, app/payroll/, or existing offline network guard. Date-only/recovery/color code and notification authorization remain byte-identical to base.

Verification on combined tree:
- Final typecheck, targeted runtime lint and webpack build: exit 0, offline network guard, synthetic configuration.
- All 81 changed TS/TSX files lint: 0 errors; 5 existing next/no-img-element warnings in product/WhatsApp pages (their image code was unchanged).
- Date-only 32, dialogue variations 32, recovery 13, relative-period and full-run regressions PASS; owner-day 9 guard groups PASS; color regression PASS. All offline, zero paid calls.
- Notification visibility/tenant/membership/branch/permission regression PASS; inquiry contact/idempotency/claim 16/16; current orders workspace 6/6 including quick filters and column pagination PASS.
- Mutation-binding/input-constraint AST invariant against 9cb33a2: 81 existing route/components unchanged; backend/schema/showroom/payroll unchanged.
- Actual inquiry route JSX with synthetic transferred conversation: NEW/assigned/overdue/converted/insufficient-rights, 390 and 1440 px PASS. 44px controls, contrast, focus, hydrated reveal-section action, no horizontal overflow. Both conversation roles and expiry warning asserted present. Screenshots detail-390/detail-1440 visually inspected.
- CRM screenshot dates intentionally retain the fixture's old precise 10:00/15:00 records; CRM timestamps are not normalized to the new showroom defaults. No real record touched.

Evidence: integration-crm-evidence/{fixtures,render,invariants}.json, notifications/targeted.json, detail-390.png, detail-1440.png and docs/evidence/owner-main-day-20261021/{verification.json,build.log}.
Reproduce fixtures with INQUIRY_EVIDENCE_DIR=integration-crm-evidence and INTEGRATION_CONVERSATION=1; invariants with CRM_INTEGRATION_BASE=9cb33a2 and the same output directory.

No push/deploy, real inquiry, order, payment, database write, provider call, environment/access/budget change. Vercel 403 remains unresolved; it was not queried or bypassed. Live acceptance is pending future authorized publication.
