# Request-local owner diagnostics

Only authorized owner-day responses expose Server-Timing stage aggregates and a fixed photo outcome enum. No logs, identifiers, chat, paths, raw errors or credentials are emitted. AsyncLocalStorage isolates concurrent requests; denied responses and non-owner-day mode have no diagnostic headers. Stage durations can overlap; availability is summed across concurrent variant reads, not wall-clock duration.

Targeted tests: request-isolation/denial/mode off; owner-day guard suite; relative-period; browse photo metadata. Typecheck/lint/build use existing offline verification profile. Goal is measurement before optimization; no timeout, rights, model, budget or data mutation changes.
