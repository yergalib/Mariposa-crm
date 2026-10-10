# User-operated local AI smoke — 2026-10-10

Prepared following explicit user permission at 10:01:09 UTC. No real key or API
request was used during preparation. This is an isolated synthetic consultation
test, not a deployed website or real CRM E2E.

## Simple user launch

Do not run in a shared/screen-recorded terminal or provide the key to an agent.
The agent must never operate the secret prompt or inspect the user's key page.

1. In the OpenAI Platform, select a separate test project with API credit and
   access to `gpt-6-luna`. Model documentation confirms public API availability,
   not access for this particular account. No model-list or credit API calls are
   made by this launcher.
2. Under that project's API keys, create a temporary secret key named
   `MARIPOSA-local-smoke`. Choose restricted permissions: allow creating
   Responses (`POST /v1/responses`), leave unrelated endpoints disabled. Do not
   create an organization/admin key or change the website/Vercel key. If the
   permission UI differs, stop rather than granting All permissions.
3. In Explorer, double-click:
   `C:\Users\Ameliestore\Documents\Codex\2026-09-30\task\mariposa-website-current\scripts\Start-MARIPOSA-AI-Smoke.cmd`
   No command writing or code editing is needed. It opens a fresh PowerShell 7
   without profiles. It first checks freshness, runtime, dependencies and whether
   the original one-shot approval is unused. If refused, no key prompt opens.
4. Read the budget statement. Continue with `TEST` only for the dedicated key
   and when account-specific extra charges do not push the test above $1.
   If unknown, cancel. Paste the key only into the hidden PowerShell prompt and
   press Enter. The API test starts after this input. Do not run it yet if only
   preparation was requested. Clear the clipboard yourself after pasting; do
   not retain the key in clipboard history/sync or share a screenshot.
5. The process ends within two minutes. It displays only success/stop and safe
   numeric counters, not model text or errors. Revoke/delete the temporary key
   in the project, then close the window. Report only the displayed status.
   A failure consumes the approval; do not delete its ledger or retry the run.

Permission reference: https://developers.openai.com/api/docs/guides/rbac
API key page: https://platform.openai.com/api-keys

## Verified price and scope

Official model page opened again on 2026-10-10:
https://developers.openai.com/api/docs/models/gpt-6-luna

The model ID remains `gpt-6-luna`. Standard input/output per million tokens are
$0.10/$0.50, cache read/write $0.01/$0.125. Above 272K input, input/cache rates
double and output becomes 1.5x; regional premium is 10%. The context window is
1,050,000. No hosted tools, image/file inputs, Fast tier or background requests
are admitted. Responses supports function calling and structured output.

Existing conservative reserve: ((1,050,000 * $0.25 + 1,400 * $0.75) / 1,000,000)
* 1.10 = $0.289905 per attempt, $0.869715 for all three. This is a token-charge
bound, not a tax/FX/account invoice guarantee. The difference to $1 is $0.130285;
unknown account extras must not be assumed to fit it. Project budget settings
do not replace the local attempt limiter. No billing setting was inspected or
changed. No preflight/count/model-list/billing HTTP calls are added.

Freshness expires at 2026-10-11 00:00 UTC. After that the launcher refuses before
the secret prompt until a separately checked code update. API availability for
the new key is established only by the first counted generation; authorization
errors stop without retry.

## Implementation and secret handling

- `Start-MARIPOSA-AI-Smoke.cmd` opens the installed PowerShell 7 with `-NoProfile`.
- `assistant-smoke-local.ps1` refuses managed transcription policies, stops any
  voluntary transcript before prompting, and disables session history saving.
  It uses `Read-Host -AsSecureString`. No secret argument, environment variable,
  `.env`, file, transcript or echo is produced by the launcher.
- The child receives a bounded ASCII secret over redirected anonymous stdin.
  Its environment is cleared except four OS/temp paths. `NODE_OPTIONS`, API keys,
  proxies and application configuration are not inherited. SecureString/BSTR and
  owned byte buffers are disposed/zeroed; transport drops its key reference and
  the short-lived processes exit. Managed runtime/TLS copies or OS swap cannot
  be guaranteed physically erased; this is not protection against a compromised
  laptop or administrator memory capture.
- Same existing harness accounting engine, approval ID and exclusive-create
  ledger: at most three generation attempts across the entire one-shot run,
  including errors. Whole approval reserved before reading the child's secret.
  Crashes and cancelled input cannot reclaim it. The readiness check does not
  reserve it. Original generic live wrappers and app gate remain blocked.
- Direct fixed-host HTTPS POST to `/v1/responses`, zero SDK/automatic retries or
  redirects, 25-second request timeout, fixed body/response bounds. Provider
  diagnostics and text never reach stdout/stderr. Unknown usage stops the run.
- The real local consultation orchestrator and read-tool runner use exclusively
  hardcoded synthetic catalog/branch data. No real DB/photos/contacts, model
  images, intake or appointment writes. Nothing is published or deployed.

## Offline verification

- PowerShell `-SelfTest`: fixed fake SecureString through the same BSTR/stdin
  path; network APIs forbidden; four synthetic product comparisons, exactly
  three simulated generations, fourth refused. Output `OFFLINE_PASS`.
- Existing `assistant-smoke-once-targeted.cjs`: arithmetic, atomic multiprocess
  claim/replay, shared allowance, failure positions, no refunds, request bounds,
  expiry, concurrency, generic live entry still blocked.
- Existing `assistant-smoke-adapter-targeted.cjs`: current orchestrator, two
  batches and final reply, eight tool operations/twelve synthetic service reads.
- New `assistant-smoke-local-targeted.cjs`: new local entry against memory-only
  filesystem ledger; success and failure at each attempt; cancelled-input replay
  refusal; transport disposal and byte clearing; fixed host/path; HTTP redirects,
  401/429/500 errors each make one fake request with no retry. Zero sockets.
- Scoped ESLint. No build needed for standalone scripts.

The actual user-console hidden prompt was not opened or automated. The key input
primitive and pipe were exercised with a fake key. No secret was created/read,
no actual approval ledger claimed and no paid/API request performed.

## Safe diagnostics added after user reported STOPPED (10:44 UTC)

The original generic message did not retain a cause. At 10:49 UTC the profile
was still fresh, the ledger was absent, and both original and updated PowerShell
-SelfTest passed. This cannot establish which interactive step failed earlier.
No real key, clipboard, process environment or browser was inspected.

Double-click scripts/Diagnose-MARIPOSA-AI-Smoke.cmd for a no-network test with a
fixed fake key. It never prompts for a real key, reserves the ledger or calls
an API. Report only OFFLINE_PASS or the bracketed STOPPED code. Do not restart
the real launcher as a diagnostic.

The launcher now emits only a fixed stage/code, never exception text:
PS_RUNTIME (PowerShell/version/language), TRANSCRIPT_POLICY (policy/read access),
SESSION_HISTORY, LOCAL_PATHS, NODE_CHECK_START/TIMEOUT/FAILED, PRICE_EXPIRED,
APPROVAL_OR_SCOPE, LEDGER_DIRECTORY_ACCESS (read-only parent write-access check),
NODE_VERSION, DEPENDENCY_LOAD, PRIVATE_CONSOLE, USER_CONFIRMATION/USER_CANCELLED,
HIDDEN_INPUT, KEY_LENGTH/KEY_CHARACTER, NODE_RUN_START, SECRET_PIPE,
RUN_TIMEOUT, NODE_RUN_FAILED, LEDGER_RESERVE, SECRET_PIPE_INPUT, KEY_FORMAT,
SCENARIO_RUN or RESULT_CONTRACT. Failure codes do not authorize retries.

Verification: PowerShell -SelfTest PASS; local entry/transport targeted PASS;
new diagnostics targeted PASS for simulated expiry, approval, filesystem access,
runtime and dependency failures with a private exception sentinel that never
appears in output; scoped ESLint PASS. Ledger untouched; zero real requests.
