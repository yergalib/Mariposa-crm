# Catalogue timeout recovery, 2026-10-21

Confirmed observations: owner catalogue API with size 90 and Oct22 11:00-Oct23 18:00 returned HTTP200 in 10238ms (8 groups). Failed colour turn recorded two planning calls, 2895ms and 2754ms, no final/review. Runtime log API returned403, so per-query timing in the failed request is unavailable. SQL snapshots showed no long-running active query; this does not establish the timing of the failed request.

Removed serial thumbnail metadata reads; retained exact publication/tenant/execution predicate. Three product reads are bounded and parallel. Optional related products stream separately and no longer calculate availability they never display. Exact affirmative any-colour preference searches current CRM data directly, preserving period/size/event; failure is unknown, not unavailable. Generated prose validation and timeouts are unchanged. No assistant redesign.

Passed offline: relative-period regression (including any-colour/cards/empty/error), full-run regression, owner-day guards, batched-photo targeted test. Final typecheck/lint/build use isolated dummy DB and block external network. Existing showroom-photos-smoke fails its cached-image-removal assertion before exercising changed browse code; not reported as passed.

Pre-publication ledger:12 provider attempts,1 smoke,0 active leases. No new provider calls, inquiries, orders, payments or inventory writes during diagnosis.
