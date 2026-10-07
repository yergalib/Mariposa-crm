# P1 document identity settings — 2026-10-07

Base: 4bcbfa18a1468aefb0247ca19b66769f1ec3f66b on review/crm-p1-integration.

## Delivered

`/settings/documents` is an owner-only interface using existing SETTINGS_VIEW / SETTINGS_MANAGE checks and current active tenant membership. It edits only existing Organization.name and Branch.name/address/phone fields. No new database schema or migration. The interface explains that these are shared CRM details and organization name applies to all branches.

Preview updates locally as plain text using the document renderer; it is clearly an unsaved sample without an order. Save validates required names/lengths, scope and ownership in a serializable transaction, rejects stale revisions and records BUSINESS_SETTING_CHANGED / documentIdentity in the existing audit log. Client state is retained on validation error. Address/phone may be empty.

Future saved rental documents use schemaVersion=2/templateVersion=2, capturing organization name and branch address/phone alongside existing snapshot branch name. V2 adds an issuer section and reuses the existing document body. The V1 schema and V1 renderer remain available; existing V1 content hashes and output are unchanged. Subsequent identity changes do not alter either old V1 or already saved V2 snapshots. No update of saved document versions is performed.

## Deliberate boundaries

Existing unsigned/non-legally-verified document text is unchanged. No new rental clauses, penalties, legal identifiers, signatures, legal claims, HTML templates or WYSIWYG editor. Legal terms are not configurable because the existing system has no approved editable fields for them. No invented legal details.

PrintButton, physical print/iPhone mechanism, print CSS and current-data working sheet are unchanged. The owner saves a new version from the existing order documents flow and prints that saved version. This block does not claim physical iPhone/physical printer retesting.

## Verification

- `scripts/document-settings-targeted.cjs`: 3 groups PASS using the actual settings/save-document service and snapshot schemas/renderers: future V2 identity capture, V1 hash/output unchanged, HTML escaping; stale revisions, oversized data, foreign branch, director/seller denies; second settings change affects next V2 only and first V2 remains hash-valid.
- Browser desktop 1440px and mobile 390px: 3 groups PASS. Live escaped preview; owner save and persistence; existing saved snapshot/hash equality; seller denied. Synthetic settings restored after test, sessions removed. Evidence: `../p1-document-settings-evidence/browser-result.json`, `settings-desktop.png`, `settings-mobile.png`; runner `../verify-p1-document-settings.cjs`.
- Existing customer document mock updated only to recognize the new renderer import and reject accidental V2 rendering of old fixtures.
- Final isolated lint/typegen/typecheck/build evidence: `../p1-document-settings-evidence/quality/result.json`.

Local review: http://127.0.0.1:62361/settings/documents . Isolated synthetic P1 database only; Production/P0 owner acceptance/photos/secrets untouched. No push/deploy. Existing local next-env.d.ts change remains excluded.

Final quality outcome: lint/typegen/typecheck/build PASS on the single final run. No unresolved implementation blocker for this block.
