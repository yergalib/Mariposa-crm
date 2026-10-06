# Warehouse presentation candidate — 06.10.2026

Owner approved UI/query changes only: separate archived inventory, readable
quantity columns and mobile layout. Base is released fe813f18. No live query,
data mutation, conversion, migration, import, push, merge or deploy in this task.

## Behavior

- Current catalog excludes products marked ARCHIVED or with archivedAt. Explicit
  Archive filter retrieves those preserved rows in both quantitative and
  individual-instance sections. No product/variant/instance is deleted or changed.
- One quantitative row represents one variant in one branch, aggregating storage
  locations. Stable pagination uses that unique pair; counts refer to these
  positions, not physical pieces or raw storage rows. Default shows all quantities
  including zero, so fully issued stock is not silently omitted. Explicit positive
  and zero filters apply to the aggregated on-hand quantity.
- Desktop uses a semantic table with headings: product/name, size, total,
  on-hand, rental reserved now, rented out, cleaning, repair and branch.
  At <=760px each row becomes a labelled card without page overflow.
- No ON_HAND/BULK/SERIALIZED enums appear in this view. Existing operational
  scan entry remains; exact SKU search uses the same table, replacing the former
  duplicate one-millisecond availability card.
- Export behavior is unchanged and its broader scope is explained. Archive/search
  filters do not silently change the existing export contract.

## Quantity meaning

Existing operational arithmetic was extracted into one shared read projection;
the single-variant service and warehouse use it. No new availability engine or
write operation was introduced. Batch-scoped reads avoid one service transaction
per displayed row. Query pages and state reads share repeatable-read snapshot.

- On-hand = sum StockLevel.quantity across branch locations. Cleaning/repair
  are included in on-hand; neither is added again to total.
- Rented out = issued - returned - resolved lost, bounded at zero per allocation.
- Total = on-hand + rented out. Sales/write-offs already reduce physical stock;
  historical sale/write-off quantities are not added back.
- Rental reserved now = existing peak-quantity calculation for active unissued
  rental allocations covering now, excluding future-only reservations. This is
  not a count of all future bookings or a promise of availability on chosen dates.
- Cleaning/repair = active maintenance allocation quantities minus recorded
  completion/transition/write-off events. Unclassified maintenance displays
  "Не уточнено" rather than invented zeros for those columns.
- No "available" number is derived by subtracting overlapping columns. User copy
  directs date-specific free-quantity checks to existing order availability flow.

Example verified: on-hand10, out2, reserved4, cleaning2, repair1 → total12,
not19. Multiple storage locations produce one state row, not repeated reservations.

## Verification

`node scripts/warehouse-presentation-targeted.cjs`: 10/10 PASS. New clone of
existing full-schema synthetic fixture; extra location and archived instance
seeded only there, then read-only application queries. Original fixture unchanged,
local cluster stopped. Tests cover grouped pagination with tied timestamps,
filters/totals/search, tenant/branch and empty-grant isolation, preserved archive
visibility, shared arithmetic with partial issue/return/loss and unknown state,
multi-location aggregation, route DENY, browser pagination/search/archive and390px
labelled cards without document overflow. Legacy warehouse test command delegates
to this current suite to avoid stale row-per-location expectations.

Actual component desktop rendering inspected at1440px, mobile at390px; native
headings and labels visible. Additional SSR check verifies unknown-maintenance
labels. Synthetic auth/AppShell substitutes in local UI fixture; no claim of
new Production or physical iPhone verification. Targeted TypeScript, ESLint and
diff checks PASS. No general regression/build repeated.

Evidence outside Git: ../warehouse-presentation-evidence/result.json,
warehouse-desktop.png, warehouse-mobile.png, warehouse-search.png.

Review limitation: pages are stable for unchanged data; inserts/deletes between
separate page requests can shift offset pages. Full build and release require
separate owner authorization. Prior physical iPhone print fix remains unchanged.
