# Isolated assistant/history/Inquiry integration checkpoint

Runtime under test: `7bc998477ec64896d1d39d95f7cd1785c25890b0`. No runtime business logic or release gates changed in this checkpoint. New code is a browser regression harness only.

## Environment and isolation

Reused the established synthetic PostgreSQL runtime identified by `audit-fixes-evidence/manifest.json` (`syntheticOnly=true`, port 62317). Initially the sandbox socket returned EACCES and the server was stopped. The explicitly scoped local startup recovered the existing test cluster after its earlier interrupted shutdown. Tests verified data directory `2026-10-05/task/import-test-runtime/pgdata`, loopback address, port and database user before writes.

The existing harness created a separate schema-only synthetic database, `crm_history_1792238279821`, and applied its existing history migration there. No Pilot/shared Production connection, environment file, production migration, API credential or paid model was used. Test-only gates were injected inside the VM loader/disposable source copy, not changed in the repository. The temporary HTTP/browser processes and the test PostgreSQL server were stopped afterward; synthetic test data and evidence remain available.

## Completed checks

| Layer | Result | What it establishes |
| --- | --- | --- |
| Existing `assistant-history-isolated.cjs` | 12 PASS | Real SQL consent/history/messages; tenant/guest/staff isolation; publication and intake gates; rollback when Inquiry insert fails; concurrent handoff creates one Inquiry/item/audit; no reservation/order/fitting; staff transcript permission checks; revoke and retention; actual route cookie/CSRF checks. |
| Existing `assistant-history-http.cjs` | 8 PASS | Actual Next dev HTTP and proxy in a disposable copy: closed-gate JSON; exact endpoint matching; cookie ownership; lost bootstrap/consent response; parallel replay; other guest denied; origin guard; expired auth does not fall back to guest; revoke and expired-history behavior. |
| New `assistant-history-browser-targeted.cjs` | 7 PASS | Actual HistoryControls → actual history route → real isolated SQL. Consent does not create Inquiry; contact alone cannot send; separate confirmation required; a response lost after commit never shows a success claim; double click and retry yield one Inquiry/item; receipt-backed status survives refresh. Actual comparison components display both catalogue prices and unverified-availability text at 390/430/1440 without horizontal overflow in the component fixture. |
| Existing targeted checks | PASS | Comparison SSR with recorded replies (including unknown prices), restored-selection boundaries, and full-run consultation regressions with explicitly scripted provider decisions. |
| New harness lint | PASS | No lint errors in the added test. |

The browser deliberately replaces one successful handoff response with a synthetic 503 **after** the server commits. The database gains exactly one Inquiry while the UI continues to say the conversation has not been handed off. Retrying the retained key returns the receipt and then the UI changes status. This tests the critical distinction between a database write and the browser having confirmation.

The new browser fixture renders current React components. Comparison data is the recorded synthetic two-product DTO (18000 and 12000 catalogue amounts), not a new CRM/LLM claim. Next Link/Image are simple local browser adapters; the surrounding page is a component test page, not the complete deployed showroom. Its screenshots were visually inspected at all three widths. The history component uses real route and SQL writes; no real person receives a message.

## What this does not prove

This is a set of connected component/route/SQL integration checks, **not** one complete deployed assistant-app E2E and **not** a real-LLM result. The browser starts from the existing synthetic assistant-context snapshot. Actual consultation draft behavior is covered separately by the scripted-provider regression. Staff transcript permissions are tested against the real service/SQL, not a newly opened production staff page.

The present owner-test configuration intentionally rejects history or intake being open (`lib/assistant/chat/owner-test.ts`); production source gates remain closed. Therefore a complete assistant → explicit send path through the untouched deployed app configuration cannot be called ready from this test. Do not loosen those gates merely to pass a test. Current Pilot DB is shared with Production and was not used.

**One next step toward Pilot verification:** provision an explicitly isolated Preview with its own synthetic database and an agreed test-only gate configuration, then run the single whole-app browser path there. This requires no new assistant business logic; it establishes the missing deployment/configuration boundary before any real Pilot use. No deployment or gate activation was performed here.

## Evidence

Committed under `docs/evidence/assistant-integration-20261017/`:

- `persistence.json`, `next-http.json`, `browser.json`: exact successful check lists and scope.
- `comparison-390.png`, `comparison-430.png`, `comparison-1440.png`: actual component pixels.
- `handoff-lost-receipt.png`: browser state after the injected response failure (the DOM assertions additionally verify the error and absence of a success claim).

The one-time paid-recheck ledger remains at 252 attempts; no model calls were made in this task. No new runtime defect was found, so only this reusable regression and evidence are committed.
