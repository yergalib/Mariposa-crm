# Internal rental read API v1

Scope: authenticated CRM staff in the existing session. This is not a public showroom endpoint, channel integration, API-key system or a write API. No external credentials, delivery or new financial/availability rules.

## Routes

- `GET /api/v1/rental/branches`: active accessible branches `{version:1,data:[{id,name,timeZone}]}`. No query parameters.
- `GET /api/v1/rental/availability`: required `branchId`, `rentalStart`, `rentalEnd`; exactly one of `variantId` (UUID) or `q` (3 meaningful letters/digits, at most 100 characters); optional `quantity`, integer 1–1000, default 1 (existing item maximum).

Datetime strings are local wall-clock values, e.g. `2026-10-10T10:00`, interpreted by the existing branch timezone helper. Response period is explicit UTC instants plus `timeZone`. Duplicate or unknown parameters, invalid dates/ranges and invalid IDs return 400.

Example from an already authenticated same-origin browser:

```js
const params = new URLSearchParams({
  branchId: selectedBranch.id,
  variantId: selectedVariant.id,
  rentalStart: '2026-10-10T10:00',
  rentalEnd: '2026-10-11T10:00',
  quantity: '1'
});
const result = await fetch('/api/v1/rental/availability?' + params).then(r => r.json());
```

Success envelope: `version`, `observedAt`, `period:{from,until,timeZone}`, `reservationCreated:false`, `limit` (1 exact variant / up to 24 search matches), `data`. A match includes variant/SKU/product/execution/size, nullable catalog rental price string, currency, availableCapacity, requestedQuantity and canFulfill. Missing catalog price remains null. The quote is observational, never a reservation or price guarantee. Search is a bounded lookup, not full catalog pagination.

Responses are explicitly projected to this contract: no purchase costs, margins, customers, payment data, internal organization ID, allocation records or total fleet figure. UUIDs are authorized staff references, not public identifiers.

## Access / failure behavior

Existing `getCurrentSession`, `ORDER_CREATE`, `CATALOG_VIEW`, `INVENTORY_VIEW`, current membership branch access and active-branch validation apply before Core reads. Tenant comes only from the session; client cannot supply an organization. Existing `searchRentalVariants` / `quoteRentalVariant` enforce catalog operation policy and use shared availability/price services. No CORS or alternate authentication is added.

JSON errors contain only `error.code`: 401 UNAUTHORIZED; 403 FORBIDDEN; 400 INVALID_REQUEST; 404 NOT_FOUND for an unavailable exact variant; 503 SERVICE_UNAVAILABLE for unexpected service failures. Unexpected database errors are not reflected. Non-GET handlers are not exposed. Responses use `Cache-Control: private, no-store` and `Vary: Cookie`. Anonymous requests are JSON 401, not HTML login redirects.

Checks: `scripts/rental-read-api-targeted.cjs` (three groups: projection/local boundaries, strict inputs/errors, permission sequencing); isolated browser/DB endpoint check in `../verify-p1-completion.cjs`. These routes do not write stock, reservations, orders, money or audit events. Future external adapters and mutation API require separate design/authorization; no delivery readiness is claimed.
