# Unified synthetic evaluation — ready, not run

User approval `Sentinel_17a23f7c61048191bfb319b259b14b25`, October 16 18:54 UTC, raises the TOTAL allowance to USD 5 including all prior attempts. All twelve old attempt files and the USD 0.2217072 reserve remain in the existing ledger. No uncertain cost is refunded. New `evaluation-started.json` is an exclusive one-use approval continuation. Calls start at 13, not 1. Only `START-ASSISTANT-EVALUATION.cmd` should be used for this evaluation; do not use earlier small launchers.

## Bound before any key/network

24 dialogues, two turns each: at most 192 new provider calls including semantic reviewers. Up to eight failed-but-completed dialogues receive one bounded consistency recheck, at most 64 additional calls. Those are labelled separate `-recheck` results; they do not erase the original failures and are not presented as code fixes. No automatic transport/auth retry. Maximum 256 new calls / 64 turns, four calls per turn, 1,400 output tokens per call (reviewers further capped at 100). Aggregate new output ceiling 358,400 tokens. Entire immutable request including tools, schema, instructions, history and tool output must fit 48,000 UTF-8 bytes; oversized requests are refused, not truncated. The prior conservative allowance of 128,768 input tokens and USD 0.0184756 per call is reused with default tier/standard mode and 10% margin. Main-only upper bound USD 3.7690224 including prior reserve; maximal upper bound USD 4.9514608 including all bounded rechecks and prior reserve. USD 0.0485392 remains outside this runner's maximum. This is an engineering reserve, not a provider account billing cap.

Unknown usage, wrong response model/tier, provider error or transport uncertainty closes the whole session after durable debit with no refund. A local scenario failure is recorded and other independent scenarios may continue. Two-hour session deadline, bounded by the existing rate expiry October 17 00:00 UTC. No restart of a used evaluation marker. Corrections after this run must preserve every debit and use only the remaining original total authorization; this launcher does not silently start a second session.

## Coverage

Cases cover positive/negative/any colour, cheaper than previous, size and date correction, combined corrections, height without size inference, unavailable/empty/unpriced products, actual synthetic service exceptions, recovery on a later turn, rules and contacts, booking confirmation versus unsent inquiry, human handoff, cancellation, comfort/fit uncertainty, purchase intent, budget reduction, saved-product comparison, malicious tool data and unsupported appointment times. Every input is newly written synthetic text. Catalogue DTOs, contacts and prices are fixtures; actual consultation, CRM tool boundary, price comparison and reviewer code run. No real client conversation, photos, database or live CRM writes are involved.

## Results and safety

Exact final post-review replies are saved per turn under the original ledger's `evaluation-5usd/<scenario>/`. Safe traces contain tool names, patch field names, result counts/error flags/reference presence and reviewer decisions, never raw tool arguments, credentials or error bodies. HTTP diagnostics retain only allowlisted status/code/type/request ID. Unknown local failures are labelled conservatively.

`scorecard.json` and `scorecard.md` are updated after every scenario. PASS/FAIL is explicitly scoped to deterministic checks: expected structured context, selected fixture cards, fixture prices, tool comparison use and no structured receipt. These checks cannot establish prose truth/style or detect every false booking/fit claim. Every row remains marked for read-through of the exact replies before final evaluation conclusions. EVALUATION_COMPLETED is not equivalent to all scenarios passing. Failed/incomplete turns have failure codes and retained completed outputs, not invented replies.

One masked key input supplies the entire session. SecureString/BSTR/stdin block is identical to the previously fake-tested launcher; no command-line key, inherited credential env, permanent storage or key discovery. The child clears its environment except OS/temp essentials. Key buffers and transport key are cleared on completion/failure. Main console remains visible for completion; closing it cancels. No keys are created by this code.

## Offline evidence

`assistant-evaluation-test.cjs` PASS: all 256 bounded calls with synthetic usage, 257th-call and 65th-turn refusal, atomic one-use approval, prior debit unchanged, expiry, fail-closed unknown usage/transport, full 24-case scorecard orchestration with intentionally failing scripted outputs, bounded rechecks, real tool success/empty/error cases, exact masked-input transfer block identity and clean child environment. Network modules are forbidden in offline suite execution. Actual CMD `--check` reports READY from scripts and System32; no key input or claim occurs. Earlier corrected runtime checks are not repeated unnecessarily.

No live evaluation has yet been run. The previous process disposed its key; the only remaining setup dependency is owner-only masked input through the single new launcher. No Production flags, deployment, push, permanent credentials or old ledger contents changed.
