# Availability and allocations

## CapacityAllocation

The former `InstanceAllocation` required an order, order item and concrete instance. `CapacityAllocation` can reserve a quantity of a variant before an instance is selected. `productInstanceId` is optional until issue; early pre-assignment remains supported and always has quantity 1.

Sources are `ORDER`, `MAINTENANCE`, `TRANSFER` and `MANUAL_BLOCK`. Lifecycle statuses are intentionally independent of order statuses: `ACTIVE`, `FULFILLED`, `RELEASED`, `CANCELLED`.

Maintenance, transfer and manual blocks use the same capacity mechanism. A maintenance block for serialized inventory normally specifies an instance. `blockedUntil = null` is an open-ended block.

## Interval semantics and buffer

Intervals are half-open `[blockedFrom, blockedUntil)`. Adjacent intervals do not overlap. PostgreSQL evaluates `tstzrange(blocked_from, blocked_until, '[)')` in the exclusion constraint; Prisma keeps ordinary `DateTime` fields for reliable reads and writes. A null upper bound becomes PostgreSQL positive infinity.

`OrganizationSettings.turnaroundBufferMinutes` is the tenant default. `Product.turnaroundBufferMinutes` optionally overrides it. The service extends the requested end by this buffer before storing `blockedUntil`, so return, inspection, cleaning and preparation time are all covered without tying the setting to one process.

The older preparation and return buffer columns remain for backward compatibility but are not used by the new allocation service.

## Double-booking protection

For a concrete instance, the database has a partial GiST exclusion constraint over instance ID and the generated `tstzrange` expression. Two overlapping `ACTIVE` allocations for one instance are rejected even under concurrent requests.

Variant-level capacity cannot be protected by an exclusion constraint. `reserveCapacity` performs this transaction:

1. acquire `pg_advisory_xact_lock` using organization, branch and variant;
2. validate tenant ownership of variant, branch, instance and order item;
3. calculate serialized or bulk capacity;
4. sum overlapping active allocation quantities;
5. verify `reserved + requested <= capacity`;
6. create the allocation and commit.

All writers for capacity allocations must use the same lock key and transaction pattern. Advisory locks are transaction-level and are released automatically on commit or rollback.

## Instance assignment

Website and CRM selection starts with product, variant, branch and dates. The allocation can remain unassigned while preparing the order. A concrete instance must be assigned no later than issue. Assignment must occur through the same locked transaction, revalidate tenant/branch/variant ownership and rely on the exclusion constraint as the final concurrency guard.

`findAvailableInstances` is an internal CRM helper. It returns assignable instance identifiers and inventory metadata, but this DTO must not be exposed by a public website API. A future public API only needs aggregate availability.

`assignInstanceToAllocation` updates the existing active allocation; it does not create a second allocation. Replacement follows the same path and exclusion constraint. The allocation must be serialized, active, quantity one, and the instance must belong to the same tenant, variant and branch for the whole effective interval.

## Availability API

`getVariantAvailability` is the shared application-layer query for CRM, calendar, mobile and future public-site adapters. It accepts only a trusted `TenantContext`, branch, variant, requested interval and optional quantity. Its result includes tracking mode, total, reserved, conservative untracked-unavailable and available capacity, fulfillment result, effective interval and applied buffer.

Only `ACTIVE` allocations block capacity. `FULFILLED`, `RELEASED` and `CANCELLED` remain historical records and no longer block dates. The overlap predicate is:

```text
existing.blockedFrom < requestedEffectiveUntil
and (existing.blockedUntil is null or existing.blockedUntil > requestedEffectiveFrom)
```

`getVariantAvailability` and `reserveCapacity` both call `calculateEffectiveInterval`; neither deprecated buffer field participates. An override replaces the organization default rather than adding to it.

## Release and domain errors

`releaseCapacityAllocation` never deletes history. It changes an active allocation to `RELEASED` or `CANCELLED` and records `releasedAt` and a reason. The capacity becomes available to the next query immediately.

Expected conflicts are typed domain errors: invalid period or quantity, resource/allocation not found, invalid allocation state, unavailable instance and insufficient capacity. Cross-tenant identifiers deliberately produce not-found behavior. PostgreSQL exclusion violations are translated to `InstanceUnavailableError` instead of exposing database details.

Open-ended blocks are accepted only for `MAINTENANCE` and `MANUAL_BLOCK`. Ordinary orders and transfers require an end. Active maintenance, transfer and manual blocks participate in the same availability calculation as order allocations.
