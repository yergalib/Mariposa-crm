# Minimal launch acceptance plan

**Preparation completed:** see [the final continuation instructions](ASSISTANT_FINAL_RUNNER_20261018.md). The earlier launcher/pricing blockers below describe the planning checkpoint and are superseded by the offline-validated continuation. No paid execution has occurred.

Application candidate: `cff3c8843833a3f951e636286e4bf2a89d5fda75`. Preparation only; no paid run authorized or started by this document.

## Verified budget

Read-only inspection of the existing cumulative ledger found exactly 252 contiguous attempts; every attempt's reservation equals its ordinal multiplied by 18,475,600 nano-USD. Reservations total $4.6558512; remaining budget is $0.3441488. Attempts 1, 2, 132 and 136 retain unknown-usage reservations. No refund or reset is assumed.

Ledger SHA-256 (attempt/usage/failure filenames and bytes, sorted): `ae1e495ebf233556320c31cb29b353afd35a8ee3bb5b7a68d597259c8df0bda8`.

At the existing conservative reservation rate, **18 additional calls** reserve **$0.3325608**, reaching **$4.9884120** total and leaving **$0.0115880**. A nineteenth would exceed $5. This is a reservation ceiling, not an invoice. Existing pricing validity expired; revalidation of model/pricing limits is required before any paid run. No current-price claim is made here.

## Minimal sequence

| Acceptance block | Reuse / remaining action | Paid calls |
| --- | --- | --- |
| Saved-product comparison prices | Reuse critical3 verified live-model DTOs and ranking, corrected actual UI SSR and 390/430/1440 browser evidence. API semantics and local rendering are covered; final deployed owner visual check remains after separately authorized publication. Do not rerun the same LLM comparison to test rendering. | 0 for local closure |
| Size + colour then empty/budget result | Two real-model turns on the existing synthetic CRM suite, retaining dates/height and exact label size. Assess actual replies and reviewer verdicts. | Up to 8 |
| Failed read then recovery | Two real-model turns with existing synthetic error/normal modes. Malformed/truncated/negative review remains a deterministic offline fault test: do not spend calls trying to provoke a random malformed verdict. | Up to 8 |
| Exclusion then positive colour replacement | Two real-model turns preserving other conditions, from the existing scenario. | Up to 8 |

After reusing the comparison evidence, six model turns may need **24 calls / $0.4434144** in the worst case, exceeding the remainder by **$0.0992656**. A bounded run capped at 18 can finish if the actual paths use fewer calls, but completion is not guaranteed. Never force fewer planning/review steps, skip review, or relabel incomplete scenarios PASS to fit the budget. A full repeat of all four two-turn blocks would allow 32 calls / $0.5912192 and is unnecessary.

Run the two-turn size/colour+empty block first, error/recovery second, exclusion/replacement third. Use only the existing synthetic fixtures and saved context; inspect every completed reply. Stop on transport/usage failure or the shared 18-call cap; no automatic retry or reserve refunds. Preserve partial evidence and mark unfinished blocks explicitly.

## What remains before execution

The previous critical launcher is both consumed (claim and execution markers exist) and expired. It is not reusable. Its hard-coded 239-call base and 24-call allowance must not simply have their expiry extended.

A separate narrowly scoped continuation launcher must first be prepared and tested offline against the exact 252-attempt fingerprint, with a one-use claim, attempt numbers starting at 253, cumulative durable debit before each request, maximum 18 new calls, existing four-call-per-turn bound, no transport retries and failure/expiry hard stops. Its three two-turn blocks must use the exact existing fixtures and the application candidate. The current generic critical runner does not implement this continuation; no executable live-ready claim is made. This requires coordinated budget, scenario, result-contract and secure-console changes, not a safe one-line expiry edit. Existing consumed launchers and ledger were left intact.

Revalidate pricing/model bounds before enabling that continuation. If the existing per-call reservation is no longer conservative, recompute a lower allowed call count or stop. Do not raise the $5 ceiling implicitly.

## Owner involvement

After offline launcher preparation, the owner only needs to authorize that bounded continuation and enter the existing permitted API key once in the existing private hidden-input console. Never paste it in chat, retrieve it from deployment configuration, save it to a file or create a replacement key/project. No owner action is required for local preparation. If the budget hard stop leaves incomplete acceptance, report precisely what remains before requesting any further decision.

Publication/production activation and final deployed UI acceptance are separate owner decisions; this plan does not authorize them. Hosted Pilot handoff already passed and must not be repeated. Application HTTP expiry enforcement remains unverified behind restored WAF; do not reopen it for this stage.

## Actions in this preparation

Read existing source/evidence and ledger only, then saved this plan. No paid calls, key input/access, ledger/claim changes, database or WAF writes, push or deploy. No application code changed and no previously passed suite was rerun.
