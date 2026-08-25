# MARIPOSA CRM database foundation

The database foundation uses PostgreSQL and Prisma ORM. `DATABASE_URL` is read
from the environment and is never stored in source control. Copy `.env.example`
to `.env` for local development and provide real credentials only locally or in
the deployment platform's secret storage.

## Multi-tenancy

`Organization` is the tenant boundary. Every business model stores an explicit
`organizationId`, and tenant-scoped business identifiers use compound unique
constraints such as `(organizationId, sku)` or `(organizationId, barcode)`.

Application queries must always receive the authenticated organization context
and filter by `organizationId`. Foreign keys alone cannot prove that two related
records belong to the same tenant, so write operations must validate all related
IDs against the current organization in one transaction. PostgreSQL row-level
security may be added later as defense in depth.

MARIPOSA, its Astana branch and main location are normal seed records. No
business rule depends on those names.

## Catalog hierarchy

The inventory model is deliberately split into three levels:

```text
Product (Белоснежка)
  -> ProductVariant (размер 120, SKU 0060.120)
    -> ProductInstance (0060.120.001, unique barcode)
```

`Product` describes the model. `ProductVariant` describes a sellable/rentable
size. `ProductInstance` is a physical unit with its own UUID, inventory number,
barcode, branch, location, operational status, condition and history.

Barcode and inventory number are business identifiers, not primary keys. Both
are unique only within an organization.

## Instance statuses

Operational statuses are `AVAILABLE`, `PICKING`, `READY_FOR_PICKUP`, `RENTED`,
`RETURN_INSPECTION`, `CLEANING`, `REPAIR`, `IN_TRANSFER`, `SOLD`, `WRITTEN_OFF`
and `LOST`. Physical condition is tracked separately as `NEW`, `EXCELLENT`,
`GOOD`, `WORN`, `DAMAGED` or `UNUSABLE`.

Reservation is intentionally not an operational status. An instance may be
physically available today while reserved for a future interval.

## Orders and calendar allocations

An `Order` contains multiple `OrderItem` records. Each item points to a variant
and can receive one `InstanceAllocation` per physical unit. The allocation uses
the half-open interval `[blockedFrom, blockedUntil)`, so two periods overlap when:

```text
existing.blockedFrom < requested.blockedUntil
and existing.blockedUntil > requested.blockedFrom
```

The basic schema includes indexes for availability queries. Application-level
checks are not sufficient to prevent concurrent double booking. A later SQL
migration must add a PostgreSQL range/exclusion constraint for active allocation
statuses, and allocation must still run inside a transaction with concurrency
control.

## Implemented in this foundation

- organizations, settings, branches and locations;
- users and organization memberships;
- categories, sizes, products, variants, prices and image metadata;
- physical instances with status and condition history;
- customers and contacts;
- orders, items, instance allocations and order events;
- timezone-aware timestamps and integer minor-unit money fields;
- repeatable seed data matching the existing mock catalog.

## Intentionally deferred

Rental issue and return documents, damages, cleaning and repair jobs, payments,
deposits, transfers, write-offs, roles and permissions are intentionally absent.
The exclusion constraint for overlapping allocations, row-level security,
storage provider integration and connection to the existing UI are also deferred
to later approved stages.
