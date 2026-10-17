# Independent review of f271023 and minimal recheck preparation

An independent read-only reviewer reproduced three defects before edits:

1. **P1:** `read_variant` of a previous white reference could become a recommendation after an explicit blue correction. An initial per-turn fix also allowed it to reappear on the following turn.
2. **P2:** “Размер 146. Подготовь обращение, но не отправляй.” bypassed preference processing and rendered a draft with old size 140.
3. **P2:** Failed-call keys depended on JSON property order, allowing the server fallback to repeat a failed cheaper read.

Corrections: recommendations now need matching current search provenance or current public product evidence for category, size and colour on every turn. Prior references remain usable for cheaper comparison, not as proof of current suitability. Unknown IDs still fail before filtering. Mixed draft requests process preferences and semantic review first; all drafts explicitly remain unsent with no inquiry created. Failed-call keys are canonical across normal, batch and server calls. A failed public verification is also recorded, preventing retries through duplicate IDs or subsequent comparison fallback. Existing availability reads and tenant/public guards are unchanged.

The independent follow-up found no remaining blocking runtime issue after these changes. It caught a regression-fixture error: failing product reads too early exercised the existing ID guard rather than the new verifier. The fixture now injects the failure only after the successful reference read. Tests also cover the second-turn resurrection, mixed-size draft and reversed JSON keys.

## Prepared scope

`scripts/assistant-critical-recheck.cjs --check` remains read-only preparation. It cannot read a key, create a claim or call a provider; no `--live` mode exists in that preparer. Following explicit authorization to complete the executable launcher, `START-ASSISTANT-CRITICAL-RECHECK.cmd` now provides the bounded execution path described below. `specifications()` supplies precisely these synthetic dialogues:

| Dialogue | Two turns | Required evidence |
| --- | --- | --- |
| colour-cheaper | White reference, then blue and cheaper | Only blue variant 21 at fixture minor-unit price 12000, current availability and unchanged dates. Never show old white as the new recommendation. |
| saved-products | Compare two supplied favourites, then ask which is cheaper | Both current public products; ordinal 2 ranked from verified same-currency prices; no request to repeat known items. |
| booking-handoff | Ask whether booking is confirmed, then request unsent draft | Explicit inability to confirm/create booking; contextual draft with no receipt or claimed delivery. These deterministic turns may use zero model calls. |

Six turns × at most four model calls gives **24 maximum new calls**, including reviewer calls. No automatic reruns. The original suite's model-tool-choice check is omitted for the colour case because the new server completion may legitimately perform the read; actual returned data remains mandatory. `assessCritical()` adds strict outcome checks, requires two reviewer trace records for each model dialogue, rejects review failure and generic refusal, and returns only FAIL or REVIEW_REQUIRED, never automatic PASS. Exact replies still require human semantic review. This is not a complete production evaluation.

## Unchanged ledger and reserve

The preparer verifies contiguous attempts 1–239, every cumulative reservation, the completed predecessor result and unknown usage attempts **1, 2, 132, 136**. Fingerprint of attempt/usage/failure files before and after preparation:

`d5fd953e7c86421ae69d4e2a32ef501a01bdeedb4e02c0c8ffa25f9852c1b7c1`

| Reservation | USD |
| --- | ---: |
| Existing 239 attempts | 4.4156684 |
| Per call, unchanged | 0.0184756 |
| Additional ceiling, 24 calls | 0.4434144 |
| Aggregate ceiling, 263 attempts | 4.8590828 |
| Unreserved after maximum | 0.1409172 |

These are conservative reservations, not invoices; no unknown reserve is released. Future numbering would start at 240. The preparation JSON is `assistant-critical-recheck-prepared-20261017.json`.

## Execution boundary

Validation: full-run regression, critical-recheck preparation/assessment, evaluation regression, independent boundaries and manager targeted tests pass offline. Typecheck passes. ESLint has zero errors and seven pre-existing unrelated warnings; changed-file lint passes. The final isolated Next build passes with zero blocked network attempts and no environment-file reads. A final preparer check confirms the same ledger fingerprint and all 239 attempts.

No API call, key access, real-ledger claim, production action or ledger mutation occurred. The executable launcher is now **READY, NOT RUN** under the existing total $5 authorization; no new budget or API credential was created. The consumed resume136 launcher must not be reused.

## Executable continuation (prepared after owner authorization)

Path: `scripts/START-ASSISTANT-CRITICAL-RECHECK.cmd`. It uses the existing installed PowerShell runtime, `assistant-critical-live.ps1`, and the existing Node executable. The actual CMD → PowerShell → Node chain was tested with `--check` and returned `READY: no secret read, no HTTP calls.` This mode does not consume the one-time claim.

The normal interactive path checks transcription policy and disables session history, clears the child environment, accepts one SecureString masked input in a private console, and sends bytes over stdin. It never puts the key in arguments, environment variables, evidence files or logs. BSTR and buffers are cleared; child cleanup and watchdogs are retained. No interactive/key-entry path was run during preparation.

The new budget module revalidates the existing ledger, preserves the four unknown reserves, and fixes expiry at **2026-10-17T18:59:59Z (23:59:59 UTC+05)**. A new `critical-recheck239-started.json` claim is created exclusively only when the live child starts; a second exclusive execution marker prevents another allowance instance. Both remain untouched now. The claim binds the ordered scenario list, 6-turn/24-call ceiling, reserve amounts and original ledger fingerprint. Every request reserves durably before transport. Requests start at 240 and stop by 263; no automatic transport retry or scenario recheck is enabled. A failed/aborted live start consumes the one-time claim and requires inspection, not blind relaunch.

The runner rejects changed prompts/specifications and executes only the three listed cases. It combines original checks with critical outcome checks, records missing/failed reviews as failures and never upgrades deterministic completion into semantic PASS.

Offline lifecycle validation passes: exclusive claim/executor, ordered scenarios, changed prompts, turn/call ceilings, reserve-before-transport, unknown usage retained, HTTP/usage/incomplete failures without retry, expiry, tampered claim, failed-review scorecard and unchanged masked key pipe. The original smoke script and old launchers are unchanged. `assistant-critical-launcher-ready-20261017.json` records readiness evidence.
