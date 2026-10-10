# Durable redacted smoke outcome

Fix for the confirmed loss of the terminal-only outcome when its window closed.
No real test was repeated. Existing one-shot ledger and missing outcome were not
modified, deleted, reset or backfilled. This change does not authorize another
paid test or refresh the price profile.

Only after a successful NEW exclusive reservation, the owning process creates
`Sentinel_d0591368cc308191bbfd7d9239e72a95.result.json` next to the original ledger
in `C:\Users\Ameliestore\Documents\Codex\2026-09-30\task\site-assistant-smoke-state`.
A separate exclusive `.result.json.claim` prevents another writer from replacing
it. Each snapshot uses a uniquely named same-directory temporary file, fsync,
close and atomic rename. It never rewrites the approval ledger. Temporary files
contain only the same redacted data; a filesystem error stops progress, including
before an HTTP attempt when the admission snapshot cannot be written.

Saved contract:
- Schema version and timestamps, fixed status/stage/error code; no error text.
- Internal admissions and separately instrumented HTTP transport attempts.
  An attempt is counted before invoking the HTTP transport; it does not prove
  the provider received or charged it. HTTP statuses and whitelisted provider
  statuses are retained when observed.
- Only validated numeric usage fields, per attempt and aggregated. Partial
  verified usage is marked `verifiedUsageComplete: false`. Unknown usage is null.
- `reservedTokenUsd` is a conservative allowance, not a bill.
  `tokenCostUpperBoundUsd` covers only the responses whose usage was verified,
  and is not the total-run cost when usage is incomplete. `actualBilledUsd` is
  always null: the local runner cannot establish the provider invoice.
- Numeric synthetic comparison count only; PASS means the scenario returned
  successfully, not an independent judgement of answer quality.

No keys, headers, request IDs, raw errors, prompts, model text, products, contacts
or customer data enter the writer. Exception/response sentinel tests verify this.

Terminal outcomes are PASS, FAIL, INTERRUPTED or UNKNOWN. Handled signals and
watchdog exit save their outcome synchronously. An uncatchable OS termination or
power loss can leave the last complete RUNNING snapshot, or no file: these mean
UNKNOWN, never PASS or zero calls. Final outcomes cannot be changed by late events
or a repeated launch. Retry remains blocked by the existing ledger.

Validation: fake transport only, network APIs forbidden. New result suite covers
success, before-send failure, after-send uncertainty, HTTP 429, aborted request,
SIGINT/process exit, missing/unverified and partial usage, repeat attempts with
byte-identical ledger/result, old ledger without result, initial RUNNING snapshot,
exclusive writer claim, secret sentinel absence and no leftover temporary file
after successful writes. Existing local transport, diagnostics, shared limiter
and consultation adapter suites pass; scoped ESLint passes. No build needed for
these standalone scripts; no push/deploy or photo/UI changes.

Final full result test evidence:
`C:\Users\AMELIE~1\AppData\Local\Temp\mariposa-result-offline-Rr3Q1k`.
Each test fixture has its own synthetic ledger and redacted result in a Temp
directory. The current real approval was neither executed nor inspected here.

