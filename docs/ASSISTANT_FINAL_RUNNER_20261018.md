# Final acceptance continuation — offline validated, not run

Application fix: `cff3c8843833a3f951e636286e4bf2a89d5fda75`. This continuation uses that fix in the existing local candidate branch; it does not publish or activate the assistant.

## Owner action

From the existing checkout, run:

```powershell
.\scripts\START-ASSISTANT-FINAL.cmd
```

The private console first validates readiness, then requests the existing API key once with hidden input. Enter starts the bounded run; closing the window before submission cancels. Do not put the key in chat, a command argument, an environment file or a new project. No new key is needed. After execution, return the console's completion/stop status so the saved replies can be reviewed. Do not repeat the launcher or delete its claim on a stop.

Safe readiness command (already passed, no key prompt or HTTP):

```powershell
.\scripts\START-ASSISTANT-FINAL.cmd --check
```

The prepared pricing window expires **19 October 2026 at 23:59:59 UTC**; each claimed session lasts at most two hours within that window. After expiry, readiness refuses before key input; revalidation is needed, not a budget reset.

## Budget and pricing

Official GPT-6 Luna Standard rates checked 18 October 2026: input $0.10, cached input $0.01, cache writes $0.125, output $0.50 per million tokens. Both planner and reviewer use this same model and Standard/default tier. [Official model pricing](https://developers.openai.com/api/docs/models/gpt-6-luna), [pricing table](https://platform.openai.com/pricing).

The existing text-only payload bound uses at most 128,768 input tokens for reservation, below the official 272K long-context threshold, and at most 1,400 output tokens (reviewer at most 300). Worst-case cache-write input rate plus output and 10% margin gives `(128768 × 125 + 1400 × 500) × 1.1 = 18,475,600 nano-USD` per call. No paid built-in tools or regional endpoint are allowed by the reused transport/request guard.

All 252 old attempts and $4.6558512 reserved remain intact, including unknown usage for attempts 1, 2, 132 and 136. The exact old ledger fingerprint is checked before claim and execution. New attempt numbers are **253–270**, maximum **18**, reserving at most **$0.3325608** additional; aggregate maximum **$4.988412**, below the original **$5**. Remaining after maximum: **$0.011588**. No usage-based reserve refunds.

Reservation is written exclusively and fsynced before each request. There is one exclusive claim and executor, no automatic transport or scenario retry, four calls per turn, six turns maximum, and hard stops on expiry, invalid request/usage, transport failure or cap. Failure retains the full attempted reservation. Old launchers and markers are untouched.

## Scenarios and interpretation

1. Explicit size 146 + blue, then reduced budget / empty synthetic catalogue: two turns.
2. Synthetic CRM error then normal recovery: two turns.
3. Exclude pink then request blue, retaining other conditions: two turns.

The 18-call allowance may not finish six turns at four calls each. Interrupted and unstarted scenarios remain **PENDING**, with completed replies retained. Completed cases are **REVIEW_REQUIRED** or **FAIL**, never automatic PASS. Raw replies, sanitized traces and a scorecard are saved under the existing ledger's `final252` directory. No real CRM/database traffic occurs; real-model calls use synthetic CRM fixtures.

Comparison prices are explicitly **API PASS (previous critical3), UI PASS (local), live after latest fix NOT RERUN**. Those statuses do not claim new live comparison evidence. Malformed/truncated/negative verdict handling has deterministic offline tests; the live run does not spend calls trying to induce malformed output.

## Offline evidence

`node scripts/assistant-final-test.cjs`: OFFLINE_PASS. Exact old bytes preserved, reserve-before-transport, nineteenth new call blocked, 270 aggregate call cap, single-use claim, exclusive executor, scenario/turn limits, expiry, altered claim/ledger rejection, no retries on transport/usage/incomplete failures, pending on cap, no automatic PASS, same masked key pipe as the existing launcher. All transports in the test are synthetic; HTTP/fetch are blocked. The actual ledger is only read, never used for a test claim.

Actual Windows launcher `--check`: `READY: no secret read, no HTTP calls.` Readiness created no claim, execution marker or attempt 253. Source lint results recorded in `assistant-final-runner-ready-20261018.json`. No full build is needed for standalone evaluation scripts.

No paid calls, keys read, publication, database writes or WAF changes occurred during preparation. Owner-run execution is the next step; this document does not claim it happened.
