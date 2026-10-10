# Read-only assistant integration — local candidate

Base checkpoint: 6bb6f1cb51f6620f50fffdd971cf0966dcb79067 (hero/colour fix). This change is a separate child commit; neither candidate is published by this task.

## Existing architecture reused

The existing assistant-ui ExternalStoreRuntime, bounded conversation/outfit engine, criteria replay, tab state, favourites, public showroom service and Core availability remain authoritative. No second catalogue, model framework, tool loop, provider or schema was introduced. The model adapter still performs at most one bounded extraction request; no model calls were made during this work. No test model is installed in application code.

| Needed capability | Actual implementation |
| --- | --- |
| searchProducts | find_dresses -> publicCatalog, with explicit branch/size/colour/local dates/category |
| getProduct | typed runner.product / get_product -> publicProduct; published tenant-scoped photos/options only |
| getPrice / checkAvailability | get_price / check_variant -> publicSelection for a known variant and the same branch/period; select -> publicSelectedCard; Core availability and shared price resolver remain downstream |
| getSimilarProducts | Existing outfit replacement search preserves that slot's category, size, colour and dates, excludes the selected variant; no invented style similarity |
| getAccessories | Existing outfit accessory/shoes category search uses actual public categories and independent size criteria; compatibility remains unconfirmed |
| getBranches | Existing list_branches, intersected with staff branch scope |
| getRentalRules | get_rental_rules projects the existing owner-approved rentalSteps and manual-confirmation boundary; no invented legal terms |

The shared runner now rejects a session whose organization differs from the server-bound storefront tenant before CRM reads. Product reads fail without an allowed public branch. Existing API permissions, staff/synthetic gates and publication checks remain in place. Inputs remain strict/bounded; callers cannot inject tenant IDs, private fields or financial values.

## Visible results when the authorised assistant is enabled later

- Search returns at most three typed cards with actual public photo metadata, exact catalogue size, price or explicit unknown price, and current availability. The new AssistantProductCard renders these results inside the existing assistant-ui thread and includes the existing favourites control.
- More uses bounded page/offset state and rechecks the same criteria. Pages of eight are shown as 3 + 3 + 2, then the next page. Available variants rank first within the current bounded CRM page; this is explicitly not a global or style ranking. Reasons mention only catalogue size, applied confirmed colour and CRM availability.
- Detail links retain branch, dates and exact size. Selection is still explicit and read-only; it creates no reservation, order, movement or inquiry.
- Comparison takes at most four identifier-only favourites on an explicit action and re-fetches publicProduct. Typed comparison cards never claim price/availability before exact selection. Client names are not trusted as CRM evidence.
- Follow-ups preserve slot criteria and period. A new/negated/unsupported colour does not silently restore a previous colour. Height is retained as an optional orientation value, never converted to an exact size or fit guarantee.
- Failed catalogue/availability reads return no stale successful search cards. Restored history still contains text/IDs only; prices/photos/availability are revalidated, not persisted as truth.

## Targeted verification

All tests use synthetic adapters/fixtures; live DB, paid provider, and customer messages were not used.

- assistant-read-tools-smoke.cjs: tenant mismatch, forbidden branch, strict extra fields, publication disappearance, availability failure clearing cards, three-result pagination, factual ranking, null price, public photos, shared period/size/colour, height not size, explicit favourites revalidation, rules, selected-item recheck failure, unsupported/negated colour correction.
- showroom-chat-smoke.cjs and showroom-outfit-smoke.cjs: established extraction limits, parameter replay, branch/date checks, no autonomous model loop, independent outfit slots, replacement/removal, selection revalidation, route gate and provider limits using mocks.
- assistant-ui-tool-cards-smoke.cjs: actual assistant-ui runtime plus production card components, safe escaped names, real DTO image source, unknown price/unavailable labels, explanation, detail-link context, favourites control, comparison uncertainty, zero actions on render. Includes assistant-ui-runtime-targeted.tsx.
- showroom-tab-state-smoke.cjs: restoration, no automatic paid request, no saved availability, abort/late response, new dialogue, logout/scope isolation, TTL and malformed-data rejection. Its old CSS/input assumptions were updated for the already introduced RentalDateRange component; no product-state behavior was changed for that test.
- Standalone typecheck, scoped ESLint and sanitized Next build are the final aggregate checks. The build uses a dummy non-listening loopback DB URL, no real credentials.

## Remaining enablement boundary

This is locally tested integration code, not an enabled live AI. access.ts remains locked to the former PILOT branch/tenant and synthetic staff requests, with an explicit enable flag and provider key requirement. It cannot activate on review/website-current-20261009 as written. A separately approved pilot scope (branch, tenant and permitted staff/audience), deliberate gate/configuration change and authorised budgeted provider smoke are required before a real model test. No key availability or paid provider compatibility is claimed from these mocks. Anonymous customer access is not enabled.

No changes to access.ts, provider.ts, API route auth, intake gate, proxy, dependencies, schema, environment, WAF or Production. No push/deploy.

Final result: all listed targeted checks PASS; typecheck/lint/build PASS. Evidence: %TEMP%/mariposa-assistant-final-2ztD1f (final typecheck, lint, build logs/results); %TEMP%/mariposa-assistant-final-QgafKW (first four passing suites, before correcting the legacy tab-state harness). The corrected tab-state harness subsequently passed independently. Initial aggregate attempts stopped at that harness failure before build; one final build completed. No unresolved check failure.
