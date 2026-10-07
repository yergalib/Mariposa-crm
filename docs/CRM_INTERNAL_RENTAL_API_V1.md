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

## Contract stabilization, 2026-10-07

The v1 paths, existing field names, string money amounts, nullable prices and error envelope remain compatible. No new public endpoint, authentication mechanism or permission is introduced. Consumers must tolerate additional fields in future compatible v1 responses; removing/renaming fields, changing money units or changing authentication requires a separately versioned contract. IDs in this API are staff-only references and must not be passed through a public adapter as an internal object dump.

Requests longer than 4096 URL characters return `400 INVALID_REQUEST` after authentication. Local times accept `YYYY-MM-DDTHH:mm` or seconds; timezone suffixes/offsets are rejected. Calendar-invalid dates, nonexistent local times and nonpositive intervals fail validation. The existing timezone resolver is reused, including its existing handling of ambiguous daylight-saving times; no timezone policy is changed here. Search does not accept `page` or cursors: at most 12 identifier matches are followed by name matches up to a total of 24, with ID tie-breakers. This is not an exhaustive catalog feed. Branches have stable name/ID ordering.

Prices are current at observation time, not the requested future rental date. Existing validity rules remain `[validFrom, validUntil)`. A matching branch price takes precedence over the organization-wide price; latest `validFrom`, then descending price ID resolves ties. Both the staff quote and rental order snapshot use the same ordering. PostgreSQL `DESC` otherwise placed nullable organization-wide `branchId` first; that bug is corrected. Existing order snapshots are not rewritten. Currency comes from the selected price; when `priceMinor` is null the legacy `KZT` fallback is retained and is not a monetary offer. No conversion or new multicurrency order support is provided. Keep string amounts intact; do not convert large integers to JavaScript `Number`, and do not reinterpret existing CRM money units.

Missing/unavailable Core resources return sanitized `404 NOT_FOUND`; Core invalid-period/quantity failures return `400 INVALID_REQUEST`. Permission failures remain 403; unexpected failures remain 503. Availability is observational and may change before an existing CRM reservation operation obtains its normal locks. `canFulfill:false` is a successful quote, not an HTTP error.

```json
{"version":1,"observedAt":"2026-10-07T09:00:00.000Z","period":{"from":"2026-11-01T05:00:00.000Z","until":"2026-11-02T05:00:00.000Z","timeZone":"Asia/Almaty"},"reservationCreated":false,"limit":24,"data":[]}
```

The example is an empty search response; an exact lookup with no match returns 404. No customer contacts, session cookies, storage keys or real identifiers are required in documentation examples.

Current checks: `scripts/rental-read-api-targeted.cjs` (four contract/security groups), `scripts/api-foundation-integration.cjs` (dedicated synthetic PostgreSQL; price precedence, scopes, operation policy, unchanged read counts and actual order snapshot), plus localhost HTTP evidence in `../p1-api-evidence/http-result.json`. No storage uploads or external sends are part of these tests.

## Actual interface inventory and integration boundary

| Surface | Present in this CRM candidate | Scope / meaning |
| --- | --- | --- |
| `/api/v1/rental/branches`, `/api/v1/rental/availability` | Yes | Authenticated GET only; existing permissions and branch scope |
| Product/catalog/photo/price REST feed | No | Catalog uses existing CRM server queries; do not claim a full public v1 product API |
| `POST /products/[id]/photos` | Yes | Existing staff multipart upload, role gate, tenant-bound product/execution; optional JSON `Accept`, otherwise redirects; not an external integration API |
| Product photo reads | Server helpers | Existing private-storage signed URLs expire after 3600 seconds, rendition fallback retained; storage keys are not a public contract; no direct caller-supplied signing endpoint |
| Inquiries | CRM server actions/services | Existing authenticated workflow and idempotency; no new JSON write endpoint |
| Reservations/orders/customer writes | CRM services/server actions | Existing managed operations only; quote never reserves; no external REST mutations |
| Finance/customer/warehouse exports | Authenticated staff routes | Download interfaces with their own scopes, not public catalog data |

The frozen showroom source is separate: `origin/review/pilot-preview-rollout` at `a5668e8a6aedb58beb32b5d0f4da04486bce439c` (local Git reference inspected, no new remote audit). Its existing `/api/showroom/catalog` and `/api/showroom/selection` GET routes and public browse/product server functions are not present in this CRM tree and are not silently copied or renamed to `/api/v1`. That source has its own bounded pagination (catalog 8 groups/page, browse 12, page 1–100), publication flags, public projections and boolean availability. Existing public product/variant references identify published catalog choices; inventory-instance IDs/barcodes, capacity internals, tenant IDs, customer data and finances must remain internal. Photos and product pages do not become an additional public JSON endpoint through this work.

That showroom source also retains `PUBLIC_INQUIRY_INTAKE_OPEN = false`: its POST inquiry route rejects before parsing contact details or entering the write service. It is not an available external intake/reservation integration. No flag, publication setting, key, secret, permission, CORS or live environment was changed. Assistants and omnichannel delivery remain outside this block. A future approved external adapter must consume an explicit public projection and preserve publication/tenant controls, rather than exposing this staff API or opening the frozen intake.
