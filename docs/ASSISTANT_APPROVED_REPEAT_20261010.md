# One separately authorized repeat

User permission: 2026-10-10 12:34:53 UTC, `Sentinel_63286b4344f88191bb5c2146fc24c49b`.
Scope: one synthetic test with saved result, at most three generation HTTP
attempts including failures, token-charge ceiling $0.869715 (within $0.87),
existing balance; no billing/top-up, publication, Production or permissions changes.

The existing approval remains unchanged. The new fixed ID is compiled into the
same harness, not generated or accepted from arguments/environment. Private
shared functions retain the same counting, price validation and persistence.
There is no arbitrary repeat counter, ledger path or reset option. The old
launcher still checks its old ledger and refuses it. The new launcher can reserve
only this new approval, once; crashes/failures do not restore its allowance.

User launch (double-click or paste this path into Windows Run):

`C:\Users\Ameliestore\Documents\Codex\2026-09-30\task\mariposa-website-current\scripts\Start-MARIPOSA-AI-Approved-Repeat.cmd`

Type `TEST`, then personally paste the active `MARIPOSA test` key into the hidden
PowerShell prompt. Do not use the revoked keys or give any key to the agent.
This is the real test entry, not the offline diagnostics launcher. It uses the
unchanged secure-input/short-lived child process and synthetic-only scenario.
The agent has not launched it or handled a key. No new key is required by this
code. The code never tops up credit or changes billing settings.

Readiness expires with the existing verified tariff at 2026-10-11 00:00 UTC.
The new ledger/result will be created only when the user starts the real test:

- `...\task\site-assistant-smoke-state\Sentinel_63286b4344f88191bb5c2146fc24c49b.json`
- `...\task\site-assistant-smoke-state\Sentinel_63286b4344f88191bb5c2146fc24c49b.result.json`

Atomic redacted output contract is unchanged from checkpoint `0d2586e`: fixed
status/stage/code, attempt counts, validated usage and cost bound only. Unknown
usage/billed cost stays null; no secret, raw exception, prompt/response text or
customer data. The earlier reported aggregate API usage does not establish PASS
for the first run and was not rechecked in this task.

Offline verification:
- PowerShell `-SelfTest -ApprovedRepeat`: OFFLINE_PASS, three synthetic attempts,
  no real key, zero HTTP calls and no real new ledger/result.
- `assistant-smoke-repeat-targeted.cjs`: temporary synthetic ledgers; old ledger
  refuses, new fixed ledger works once, three attempts then fourth refused,
  matching approval ID/$0.87 reservation, durable result, another launch refuses,
  old/new ledger and final result byte-identical after refused replay.
- Result, diagnostics and shared-limiter regressions pass; scoped ESLint passes.
- Evidence: `C:\Users\AMELIE~1\AppData\Local\Temp\mariposa-fixed-repeat-wn6Okp`.

Actual old ledger checked before and after preparation: 374 bytes; identical
SHA-256 `42c86ca959a42ce645189636afb6aafc10599d8a97785a0be9a9a5dd2e6a986b`.
New real ledger and result are absent after verification. Real API calls: zero.
