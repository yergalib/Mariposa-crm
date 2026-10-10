# Incremental assistant rental period

Base: bba43607e4d917d4320413f47bba9fc1f98c784e, review/website-current-20261009. Photography/publication frozen. This change touches only the existing outfit conversation engine, one isolated regression test and this note.

## Confirmed gap

The engine previously threw "Выберите филиал, получение и возврат" as soon as one endpoint existed. A client could not give pickup and return over separate turns. In addition, a date-only return answer was parsed as pickup and could overwrite the saved start. Validation ran before merging the latest correction, so an invalid newly supplied period could reach selected-item revalidation.

assistant-partial-period-smoke.cjs was run before the fix and failed on the first partial pickup with that exact AssistantError. Existing read tools, favourites comparison, scoped tab persistence and unsent handoff from b256c891/f8d9909 were retained.

## Result

Partial conversational dates are retained in the existing context. A single unlabelled date fills the missing endpoint; explicit pickup/return corrections keep their meaning. Both endpoint orders work. Branch-local validity checks now run after merging and before selected-item availability reads. Civil date syntax can be checked before branch selection; branch-specific time checks run when the branch is known. Existing maximum start horizon (366 days), maximum rental duration (31 days), and chronological order remain enforced. A standalone return is bounded by their combined 397-day maximum horizon.

No availability request is made for an incomplete period. Explicit calendar Apply and selection still require branch and both endpoints. Dates, height, exact size and colour survive subsequent clarification and the existing storage schema. Height remains an orientation value; it does not become a size. Card selection uses the existing public CRM runner, rechecking variant ID, price and availability rather than creating inventory state or a booking.

## Evidence

C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-partial-period-Ruf20V contains logs and results.json. All exit 0:

- assistant-partial-period-smoke: pickup + height → exact size → pink → white correction → unlabelled return → explicit card selection; missing fields only, both endpoint orders, context storage roundtrip, no early availability, invalid correction rejected before reads, strict calendar action, forbidden branch and invalid dates. Synthetic card IDs/prices/availability only.
- assistant-read-tools-smoke: existing tenant/publication/read-tool protections.
- showroom-outfit-smoke, showroom-chat-smoke, showroom-tab-state-smoke: existing conversation/selection/storage regression coverage.
- TypeScript typecheck and scoped ESLint.

No paid provider, live network/DB writes, migration, env/key/permission changes, intake/LLM enablement, full E2E, push or deploy. No photographs, home layout or photo manifest changed.

This checkpoint fixes incremental period collection only. The phrase "cheaper" still needs a separately designed, bounded comparison of actual CRM prices; this change does not claim price ranking or a working live AI. Live model activation remains blocked by the unresolved authorised safe environment/key and enablement decision.
