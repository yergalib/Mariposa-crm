# Catalogue-first showroom — 2026-10-01

User decision: show published products immediately; existing categories on the left,
separate search; size, branch and explicit dates belong inside the product.

- `/showroom` renders public model/execution groups on the server, 12 per page.
  Category/search/page are GET parameters; product links and back links retain them.
- Categories come from active tenant categories containing eligible published items.
  Mobile uses a native modal category drawer. No invented categories or photos.
- Browse DTOs contain display metadata only. No price/availability claim before
  the product selection. Product detail exposes eligible variant IDs and size labels.
- `/api/showroom/selection` validates one branch/variant/period and reuses the
  existing CRM availability/current rental price logic. The public endpoint is
  explicitly allowlisted; tenant remains server-bound to PILOT.
- Inquiry form retains its idempotency/retry lock and minimal contact collection.
  It creates an inquiry only; no order, inventory reservation, payment or stock move.
- Existing guided-selection contracts remain available for later channels, but the
  catalogue no longer starts with a wizard or asks for size/date filters.

Validation: typecheck; lint; build with a non-connectable dummy DB URL;
`scripts/showroom-browse-smoke.cjs`, `showroom-submit-smoke.cjs`,
`showroom-grouping-smoke.cjs`, `pilot-preview-isolation-smoke.cjs`.
Smoke tests use mocked DB/fetch only. Browser interaction, live product rendering,
mobile layout and an actual inquiry write are not verified by these checks.
The current browser session is restricted; do not bypass its access restriction.
No schema/data/configuration changes are required by this UI change.
