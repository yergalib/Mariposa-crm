# Verified-data fallback checkpoint, 18 October 2026

Base commit: `be1d7f72b4899c78e0920a623eb9430491d6f146`.

## Reproduction and fix

The saved offline recovery regression reproduced successful CRM data being discarded after an invalid reviewer verdict. Historical raw malformed responses were not retained, so this reproduced the observed failure mode, not their exact bytes.

Strict JSON parsing remains unchanged. An unavailable, invalid or truncated verdict is now distinguished from a valid negative verdict. With no proposed model preference edits and no handoff request, the response may expose only already-read current-turn search cards matching saved criteria, verified supplied-product comparisons, or a successful empty-batch result. Server-authored wording explicitly says that correspondence to the latest clarification is unconfirmed.

No model prose, unreviewed model preference changes, extra CRM reads, model retries, receipt or booking claim is introduced. Valid negative verdicts, unreviewed preference proposals and missing/failed CRM evidence remain blocked. Existing narrowly validated explicit corrections remain unchanged. This mitigates lost verified results; it does not establish the historical malformed-output cause or prove live semantic quality.

## Validation completed before disconnection

- Full-run regression: PASS, including malformed JSON, truncated response status, excess output-token count, valid negative verdict, blocked model preference edit, failed CRM read, successful empty result and supplied-product comparison.
- Evaluation regression, manager targeted integration, independent boundaries and comparison presentation: PASS offline.
- Typecheck and lint of changed files: PASS.
- Full build was not repeated: the prior isolated build passed, and dependencies, routes and build configuration did not change.

After reconnection, shell succeeded and the complete diff matched the three tested source/test files. No further application edits or redundant test runs were needed. Documentation was then added for the local commit. No unrelated changes were present.

## Remaining four live checks

1. Saved-products comparison: displayed catalogue prices and cheaper selected product, with size/dates retained and date availability explicitly unverified.
2. Explicit size + colour correction followed by empty results/budget constraint; inspect actual reviewer parsing and retained context.
3. Transient CRM read failure followed by recovery; unavailable reviewer must expose only verified data with the limitation, never unchecked prose or a false success.
4. Negative colour exclusion followed by positive replacement, retaining other preferences.

## Prior hosted Pilot clarification

A normal authorized OWNER session was observed in the existing Chrome profile after the login page. Manual owner login versus recovery of an existing session was not independently established; the agent entered no credentials and read no secrets/cookies.

Window start: `2026-10-18T06:40:42.527Z`; deadline: `2026-10-18T07:10:42.527Z`. At database time `2026-10-18T07:10:59.952108Z`, read-only SQL confirmed the deadline elapsed and one start audit. Conversation/Inquiry/item/creation-audit counts remained 1/1/1/1; new financial transactions, orders and allocations since start were zero. Application HTTP expiry enforcement remains unverified behind the restored WAF, which was not reopened.

## Scope

Zero paid calls, remote data writes, publications, new keys or WAF changes in this local stage. Budget unchanged: 252 attempts, $4.6558512 reserved, $0.3441488 unreserved of $5. No push or deploy.
