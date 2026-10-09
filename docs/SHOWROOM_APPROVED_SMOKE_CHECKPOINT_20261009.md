# Approved Preview and bounded smoke checkpoint

Approval: Sentinel_d0591368cc308191bbfd7d9239e72a95, 2026-10-09 12:44 UTC. Scope: publish tested website/hero fix; at most six fictional-text OpenAI calls and USD1 total, only confirmed testers, after verifying the limiter. No Production changes, CRM/intake writes, new credentials or auth bypass.

## Publication completed

One successful Git push: review/website-current-20261009 -> b256c89163774d37de343c5479d86337fdede85b. An earlier shell attempt stopped at Git ownership validation before any push; the successful command used a per-command safe.directory, without changing global configuration.

Git-triggered deployment dpl_EDafwU2Yz9iavfam59WJCkjcyHth is READY and its metadata matches the exact SHA. Existing stable alias mariposa-crm-git-review-website-current-20261009-mariposa-crm.vercel.app maps to that deployment. Main remains 9f1a8488ca0f932cbd7ccdf500baae15208620a7. Production remains dpl_Hv2Lpo54tNfpwG4hpGva3XnMyuUS / 4648d70cee004c01d515770c389370dd34a3114b.

## Isolated limiter prepared, not activated

scripts/lib/assistant-smoke-once.cjs reserves the entire USD1 authorization using an exclusive-create, fsynced marker before operation. The live entry uses a fixed approval-specific path outside the repository. Existing reservations cannot be reset/refunded by the harness; a failed/crashed run cannot restart. A closed provider wrapper permits at most six sequential calls, consumes failures, refuses overlap/retry beyond six, expires after 15 minutes, and validates gpt-6-luna, store:false, reasoning:none, output600, body<=24000 UTF8 bytes and text-only input without hosted tools. It imports no model client or credentials.

This is explicitly an isolated single-executor mechanism, NOT a distributed Vercel quota. It refuses VERCEL/VERCEL_ENV runtimes. The whole-authorization marker must not be deleted, moved, recreated under another root, or used on multiple machines. It is not wired to the website endpoint and no live allowance was consumed. An authorised runner would use the existing zero-retry provider adapter. Under the checked Standard GPT-6 Luna pricing and bounded text-only request shape, six such extraction requests have a conservative estimate below USD0.03; the reservation remains USD1 without refunds. This does not establish the account's separate billing settings or permit other traffic.

Test: scripts/assistant-smoke-once-targeted.cjs PASS. Four competing Node processes produce exactly one reservation; replay rejected; six simulated failures consume all six slots; extra call rejected; concurrency/expiry/closed states and request bounds verified; Vercel runtime rejected. All provider calls were synthetic. Evidence: %TEMP%/mariposa-smoke-reservation-test-xIPe8l. No application code/dependency/schema change; no new build required for this standalone harness.

## Tester and runtime blockers

Read-only membership metadata confirmed exactly one active OWNER in MAIN; exact user/membership IDs retained outside the repository as task evidence. No developer identity was inferred. Existing CRM session, CATALOG_VIEW, tenant and branch checks must remain mandatory, in addition to Vercel Auth.

The current tools do not expose an authorised browser controller/session. Chrome processes exist, but process metadata inspection for an already enabled debugging connection returned access denied; no browser settings/cookies/profile or authentication material were read or changed. Unauthenticated Preview requests reach Vercel SSO, not the application. Owner CRM role metadata is not proof of a usable authenticated browser session.

The existing provider key is configured in Vercel Preview only, as confirmed by names/scopes, not decrypted values. No permission exists to extract/copy it into this isolated executor. Conversely, the local reservation file cannot protect a distributed Vercel endpoint. Therefore no real model call or Preview enable occurred.

Minimum next requirement: an authorised tester session plus either (a) an explicitly permitted single executor where the existing provider can already run securely alongside this persistent reservation, or (b) permission for one shared, atomic smoke reservation in isolated non-Production storage before enabling Preview. No production DB write, new schema, key copy or process-local workaround is implied. Until then, website publication is complete and the paid smoke remains blocked/disabled.

Prepared scenarios: missing size; exact size phrased as clothing label; height without exact size; negated/ambiguous colour; incomplete date/time; follow-up preserving criteria. Fictional text only. CRM read-only results remain server-side. The smoke validates bounded extraction and existing typed tools, not a new autonomous agent. Model/API key validity and real paid usage remain untested.
