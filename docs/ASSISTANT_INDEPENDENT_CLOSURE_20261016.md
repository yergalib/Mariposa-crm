# Independent local closure

The earlier missing-DATABASE_URL build failure is closed for **isolated compilation only**. The established method is documented in `ASSISTANT_CONSULTATION_20261009.md`, `ASSISTANT_CONSULTATION_REVIEW_FIXES_20261009.md` and implemented for local startup in `scripts/showroom-next-local.cjs`: an allowlisted child environment and `postgresql://synthetic:synthetic@127.0.0.1:1/synthetic`. No real environment files exist in this checkout (names inspected only).

`node scripts/assistant-isolated-build.cjs` ran `next build --webpack` in this checkout with that synthetic URL. Its child-only preload blocks TCP/TLS/datagrams/fetch and is inherited by Node workers. **PASS, exit 0, zero network-block events.** No production credentials, environment-file changes, accesses or database configuration were used. This does not verify real database integration. Evidence: `../assistant-final-isolated-build/result.json` and `build.log`.

Independent adversarial regression `node scripts/assistant-independent-boundaries.cjs`: **PASS**. Fourteen negated/ambiguous/wrong-slot colour commands remain unparsed; three positive controls work. Eight ID/tenant cases reject product IDs as card IDs, unreturned variants, unknown IDs, wrong execution, variant-as-product, cross-tenant access and a public-service result with mismatched product ID. Production validation was not relaxed. The previous ten runtime regression checks remain in `assistant-evaluation-regression.cjs`.

The preparation-only script `assistant-repeat-preparation.cjs` imports no transport, reads no key, claims no session and never modifies the ledger. It verifies contiguous reservations before calculating the bounded manifest in `assistant-repeat-prepared-20261016.json`. Separate offline checks prove refusal for insufficient budget and a corrupt reservation and preservation of old records.

- Existing attempts: **125**, reserved **$2.30945**, unknown-usage attempts **1, 2** still charged against the reserve.
- Prepared scope: **16 scenarios × 2 turns × at most 4 calls = 128 calls**. No automatic rechecks.
- Maximum additional reserve: **$2.3648768**; aggregate **$4.6743268 / $5**. This is an engineering reserve, not a provider invoice or provider-enforced billing limit.
- First future attempt would be **126**, only after fresh validation of this same ledger.
- Paid execution remains disabled. The old completed evaluation launcher cannot be reused; any future continuation needs a valid authorized session and exclusive continuation claim, respecting the original expiry and usage checks. No expiry extension, key prompt or paid call occurred.

Scoped ESLint for all four new scripts passed. The isolated build includes TypeScript. No application source changed in this follow-up.

Remaining blocker: no active authorized credential-bearing live session. The prepared manifest is not a live execution claim. Actual model behavior, the previously omitted rejected IDs and the previously incomplete second turns remain unconfirmed until an authorized bounded live continuation is possible. Real database/production E2E remains outside this local check.
