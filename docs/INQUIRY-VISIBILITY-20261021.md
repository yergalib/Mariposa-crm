# Inquiry visibility and internal notifications

Base: `c6924f2b7710c03a59232b5f9826e221b8f95046`. This is an application patch, not the separate design prototype.

## Behavior

- List/board and detail show an explicit status, status explanation, received date/time, assignee, next step and its deadline. Date formatting uses the branch business timezone. Empty values remain empty and are labelled rather than fabricated.
- Remove the incorrect statement that website inquiries never arrive. A request is explicitly distinguished from a confirmed reservation.
- Secondary editing uses a native disclosure; the existing form, validation and action are retained.
- Add NEW inquiries to the existing `staffNotifications` projection and hence the existing AppShell count. Each row is one inquiry, with a direct detail link. No read receipt, event delivery table, subscription, migration or external message is introduced.
- Inquiry visibility follows LEAD_VIEW + route access + current active membership + organization + accessible active branches, including unassigned inquiries. It intentionally does not inherit the assigned-only filter used for tasks. The same inquiries are already readable in `/chats`.
- NEW disappears from the projection after a status transition and next existing refresh/read. Opening the card alone does not mark anything read. Creation time is not a due date; new inquiries are never labelled overdue merely because they arrived earlier.
- Bound to the earliest 100 NEW rows, with the existing overflow indicator and full-queue link. Existing refresh behavior is unchanged: notification page refresh/focus/minute refresh; AppShell count on server render. No new global background polling.

## Validation

PASS:

- `node scripts/inquiry-visibility-targeted.cjs`: actual notification, workflowScope, member permissions, route access and route JSX; synthetic DB/auth boundaries. Foreign tenant/branch, inactive branch, revoked LEAD_VIEW, inactive membership, empty scope, unassigned arrivals, OWNER scope, transition removal, row uniqueness and bounded result tested. Rendering asserts the existing AppShell count, 09:28 branch-local time and readable fields.
- `node scripts/staff-notification-scope-mock.cjs`: existing payroll notification isolation regression.
- `node node_modules/typescript/bin/tsc --noEmit`.
- ESLint on all changed TS/TSX application files.
- `node scripts/inquiry-visibility-build.cjs`: Next production webpack build, allowlisted dummy environment; TCP/TLS/fetch blocked. No real DB or model calls.
- `node scripts/inquiry-visibility-render.cjs`: actual fixture-rendered routes at 1440 and 390 pixels, no horizontal overflow, visible receipt/status/count. Screenshots cover list, detail and notification page. Navigation/auth/data boundaries are fixtures; this is not an authenticated deployment test. The production components and page JSX are rendered, not rewritten as a standalone mockup.

Visual review: the new status panel precedes customer/product detail, shows readable empty fields, and remains within the mobile viewport. The notification page shows a single synthetic incoming inquiry and a count of 1. Existing overall application design is retained; the broad prototype redesign has not been applied.

## Environment notes

Independent clone in this task; no shared AI checkout/index/branch/process changed. `npm ci --ignore-scripts` installed exact lockfile dependencies in this clone only. Existing generated Prisma types were copied locally; the source Prisma schema SHA-256 is identical to the accepted source. A fresh generator attempt was blocked by an external Prisma cache timestamp permission; no cache permissions were changed. Typecheck and the full build pass with the matching existing generated types.

Initial sandbox build hit EPERM writing its own `.next` directory. The same offline build passed with process permissions; the network-blocking preload remained enabled. Screenshot profiles are isolated in temporary directories and their own browser processes were closed.

The real inquiry `34e6db39-6066-45bd-9ab6-2665ef8ebaa0` was not modified or assigned. No statuses, contacts, orders, payments, inventory, cash or subscriptions changed. No push/deploy performed. Integration should retain the parent branch's newer unrelated work and run normal checks against the combined candidate.
