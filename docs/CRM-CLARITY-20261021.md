# CRM action clarity — local integration candidate, 21 October 2026

## Base and boundaries

Worktree: `crm-action-clarity`, branch `fix/crm-action-clarity-20261021`.
Base: stable website branch `46a819eac0cf0136fe68457f97335239af2dbd26`.
Notification/inquiry fix `e347c4848fe80980b0f5854bddcc230cd4b04387` was adapted as `29b03b2` on that base. The only conflict was the detail page: this base has no AI conversation block, so no nonexistent conversation variable was introduced. Do not remove a newer conversation block during integration onto a different branch.

No push, merge or deploy. No environment secrets copied. No live database access, records, messages, payments, stock or model calls. The shared AI checkout and its processes/index were untouched. UI commit is separate from the adapted notification commit, so an integrator who already has e347 can cherry-pick only the UI commit and resolve against their actual latest branch.

## Implemented

- Inquiries: arrival time, status/help, responsible person and next step retained; explicit open-card action and page-bounded board counters. Request/contact/period/size have separate readable fields. Main actions show processing → availability → order. Editing, selection and order forms are secondary disclosures. Order shortcut opens and focuses the existing conversion form, which still creates a draft and explains that reservation is separate.
- “Взять в работу” uses the existing `saveInquiryAction` / `updateInquiry`, version check, permissions, branch/tenant checks and audit. Visible only for an unassigned NEW inquiry, no order, LEAD_EDIT + LEAD_ASSIGN and an eligible current assignee. It does not submit contact, preserving it server-side. All other fields are retained. The shortcut is withheld for sub-minute dates to avoid normalizing them; ordinary editing remains available.
- Shared UI: visible mobile primary labels, 44 px action targets, keyboard focus, stronger status text/contrast, explicit secondary/danger treatment and button-like navigation links. The unrelated fallback “Новый заказ” is removed from other section headers; the orders list has its permission-checked action. Notifications are included in desktop navigation.
- Customers/tasks/shifts/stocktakes: visible textual status chips; stocktake status enum names translated without changing values. Settings menu links look actionable; business settings grouped in native disclosures with disabled explanations. Warehouse/template disabled reasons are explicit. Destructive action confirmations and required fields remain intact.
- 83 actual page routes inventoried; 75 internal routes covered by shared styling, route guidance or dedicated workflow changes. Exact file/route coverage: `CRM-CLARITY-ROUTES.json`. Public showroom, auth/invite, payroll and standalone print/labels excluded. Time calculations and internal time inputs remain unchanged.

## Verification

All data is synthetic. Browser screenshots render actual route JSX, AppShell and Sidebar, with data/auth boundaries replaced by fixtures. Unrelated scanner/session components are stubbed; this is not a live end-to-end CRM session.

- `node scripts/crm-clarity-fixtures.cjs`: 13 actual screens + permission/assigned inquiry claim visibility.
- `node scripts/crm-clarity-render.cjs`: 26 viewport checks (1440/390), no horizontal overflow; visible action targets >=44 px; primary contrast >=4.5:1; visible keyboard focus. Actual hydrated RevealSectionLink opens the conversion disclosure and focuses its summary.
- `node scripts/crm-clarity-invariants.cjs`: original mutation bindings and input names/constraints unchanged across 80 existing JSX files; no changes in lib, prisma, showroom or payroll since notification integration.
- `node scripts/inquiry-reply-contact-mock.cjs`: 16/16, including actual shortcut payload → existing server action/service; unchanged contact, date conversion, stale version rejection and revoked assignment permission.
- `node scripts/inquiry-visibility-targeted.cjs`: scoped new-inquiry notifications PASS (run with a separate evidence output to avoid replacing final screenshots).
- `node scripts/staff-notification-scope-mock.cjs`: PASS.
- `node scripts/crm-permission-invariants-mock.cjs`: 6/6.
- `node scripts/crm-read-scope-mock.cjs`: 11/11.
- `node scripts/order-list-filters-mock.cjs`: 6/6.
- `node scripts/calendar-branch-timezone-mock.cjs`: 6/6.
- `tsc --noEmit`: PASS. ESLint full repository (`eslint . --quiet`): PASS, no errors.
- `node scripts/crm-clarity-build.cjs`: production build PASS with dummy database URL and all network calls blocked by preload. Types generated from this base's Prisma schema; no migration.

Screenshots and machine-readable evidence are in `crm-clarity-evidence/`. Generated local HTML fixtures are intentionally untracked. To reproduce, generate Prisma types for this schema, use installed lockfile dependencies, then run fixture/render scripts. Isolated Chrome is required; no user browser profile is used.

## Limits / integration work

The 75-route coverage is source/shared-component coverage, not a claim that every populated/error/permission state of every route was opened. Visual checks cover inquiries list/detail, notifications, orders, sales, customers, products, tasks, schedule, cash, settings, business settings and stocktakes. Other routes inherit the checked styles and pass type/build/input-binding checks; their individual populated states remain visually unverified.

No production user journey or real mutation was executed. No iPhone scanning or physical printing was repeated. Publication remains blocked by the parent's Vercel access issue. Integrate locally with current site/AI work, then verify the published version when access is restored; do not ask the owner to test business logic. Owner cash balances/payment configuration/staff rates are not invented or changed by this patch.
