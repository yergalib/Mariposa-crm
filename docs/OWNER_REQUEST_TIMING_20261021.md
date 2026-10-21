# Request-local owner diagnostics

Only authorized owner-day responses expose Server-Timing stage aggregates and a fixed photo outcome enum. No logs, identifiers, chat, paths, raw errors or credentials are emitted. AsyncLocalStorage isolates concurrent requests; denied responses and non-owner-day mode have no diagnostic headers. Stage durations can overlap; availability is summed across concurrent variant reads, not wall-clock duration.

Targeted tests: request-isolation/denial/mode off; owner-day guard suite; relative-period; browse photo metadata. Typecheck/lint/build use existing offline verification profile. Goal is measurement before optimization; no timeout, rights, model, budget or data mutation changes.

Measured baseline (caa0d48, real OWNER read, no model): browser17449ms; server16345.8ms; session2642.4; permission382.7; setup1711.1; catalog8361.5; cards3208.4. Availability sum11279.1ms/8 concurrent reads (not wall time).
Photos: f07 catalog200, auth1400.1ms/storage1006.3ms/total2888.3ms; d5 catalog200, auth1399.4/storage774.4/total2584.3. Valid decoded WebP. Prior503 not reproduced or attributed retrospectively.

Optimization: independent capacity reads run concurrently only for standalone availability reads; explicit transaction callers retain sequential mode. Formulas, predicates and read counts unchanged. Baseline-versus-new synthetic tests cover serialized/bulk available/unavailable/zero capacity: identical results/read counts,694ms vs480ms with injected15ms read latency.
Read-only API scope reuses session and CATALOG_VIEW lookup within one request, as RSC request memoization already does. Every owner boundary still asserts exact org/member/role/expiry/config window. No store exists across requests or for write handlers. Concurrent requests and outside-scope calls tested for isolation; owner-day guard suite passes. No cache of stock, availability, business DTOs, or model responses.
