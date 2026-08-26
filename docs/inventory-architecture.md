# Inventory architecture

## Tracking modes

`Product.trackingMode` selects one inventory model for every variant of a product.

- `SERIALIZED`: every physical unit is a `ProductInstance` with its own barcode, condition, status, branch, location and history.
- `BULK`: units are held as a non-negative quantity in `StockLevel`; individual barcodes are not required.

Existing MARIPOSA dresses are `SERIALIZED`. A product must not mix serialized instances and bulk stock. Application write services must enforce this rule when catalog editing is introduced.

`StockLevel` is scoped by organization, variant, branch and optional location. Location is part of the stock identity because locations represent real storage zones. PostgreSQL uses a `NULLS NOT DISTINCT` unique index so only one branch-level row with a null location can exist.

## Physical status and calendar availability

Physical status answers where an instance is and what operational process it is in now. It must never gain a `RESERVED` status. Calendar availability is represented only by active `CapacityAllocation` records.

Permanent serialized capacity excludes instances that are retired or have `SOLD`, `WRITTEN_OFF` or `LOST` status. Temporary statuses such as `RENTED`, `CLEANING`, `REPAIR` and `IN_TRANSFER` do not permanently reduce capacity; their periods must be represented by allocations.

If a temporarily unavailable status has no active allocation covering the current moment, the availability engine treats that instance as conservatively unavailable. This is an integrity-gap safeguard: the engine must not promise an item whose temporary state has no trustworthy end. Once the physical workflow has a correct temporal block, future availability is determined by that block rather than by the current status alone.

Bulk capacity is the sum of `StockLevel.quantity` for the requested tenant, variant and branch. Serialized and bulk capacity are never combined.

## Tenant enforcement

UI code obtains `organizationId` from the authenticated server session and creates a `TenantContext`. Catalog, inventory and availability services require that context rather than accepting an optional tenant filter. Every top-level query and every relation used for authorization is scoped to the same organization.

The context is deliberately transparent instead of a Prisma Client Extension: the tenant boundary remains visible in code review and Prisma behavior is unchanged. Direct `db` access is infrastructure-level; new business features should expose tenant-scoped DAL or service functions rather than importing it in pages.

## Invariant

**PHYSICAL STATUS is not CALENDAR AVAILABILITY.** `RESERVED` must never be added to `ProductInstanceOperationalStatus`. Reservation, maintenance, transfer and manual blocking are temporal `CapacityAllocation` records. CRM and future public-site endpoints must call the shared availability service rather than reconstructing this logic in UI code.
