# Bounded derivative repair — completed, HTTP entrypoints removed

Completion: 2026-10-21. All 62 approved originals produced exactly 124 catalog/site objects. 124 created, 0 skipped, 0 unresolved file errors. Each object was downloaded, decoded and hash-compared by the server. Owner GET status independently reported 124/124. SQL aggregate: 267 active original records and 267 original objects unchanged in count; catalogue/site objects increased from 205 each to 267 each. Full receipts: `docs/evidence/photo-repair-live-20261021/final-manifest.json`; final owner status alongside it.

Execution release: 187db2932f67cadf2755f7d501d8a0c46f774d8d, READY deployment dpl_7hGfm3W5aCsvtHCyQue8AeDbHjTq, stable owner-only alias. Initial ce20abe attempt created zero objects; inspection found storage-js exists() returns data:false plus error for ordinary missing objects. The repair switched to freshly authorized object metadata reads, preserving upsert:false. The initial response did not identify its exact failure stage, so its root cause is not claimed proven. One subsequent UI Automation read interruption was recovered from the successful browser receipt and SQL without resubmission.

Live owner Chrome checks: restored full photograph in purchase card 0003 (Venok melkie babochki Roza), restored white photograph in rental card and catalogue 0006 (Venok belyi gipyur zhemchug). Model-level 0003 source itself contains multiple colours and has no selected execution; no new execution/colour inference or relinking was made. Existing missing-source/linkage placeholders remain, including 6118. Screenshots are saved outside the repository in `../photo-repair-live-20261021/`.

Cleanup deletes only the temporary page and API route. It makes no Storage calls and deletes no images. The fixed manifest and unreachable service remain as reproducible test evidence; no app entrypoint imports the service. No credentials/env/protection/permissions or business records were changed; no paid AI calls. The separate reported AI relative-date instruction defect is not included.

The original reviewed plan follows for historical evidence; its temporary launch URLs no longer exist after cleanup deployment.

Approval scope: create only catalog/site versions for the 62 originals in the checked-in manifest (124 exact destination keys). The manifest matches the read-only Storage recheck on 2026-10-21. No messaging derivatives, original uploads, ProductImage writes, relinking, bucket creation, permissions, credentials or environment changes.

## Minimal execution surface

- `/owner-maintenance/photo-derivatives`: authenticated owner page, native same-origin form, no caller inputs.
- `GET /api/owner-maintenance/photo-derivatives`: owner-only metadata manifest/status, no writes.
- `POST` at the same API path: empty body/query only, exact stable Preview origin and same-origin Fetch Metadata. Chooses the first incomplete source on the server; at most two inserts per request. No automatic browser loop or automatic retry.
- Both page/API invoke existing `requireOwnerDaySession(CATALOG_PHOTO_MANAGE)`: exact MAIN organization and owner membership, ordinary valid session, existing permissions and Preview configuration. Existing DB/Storage resource guards stay intact. Database clock verifies the approved window; a separate hard expiry at 2026-10-25 19:00 UTC prevents a later owner-test extension from extending this repair.
- Source ID, product, path, ACTIVE/not-deleted state and null execution/variant linkage must still match the manifest. Existing `renderProductImageRenditions` provides Sharp rotation, inside/no-enlargement resizing and WebP quality82; messaging output is discarded, never uploaded.
- Check existence immediately before insert, `upsert:false`. Concurrent or uncertain insert resolves through exact byte-hash readback, never replacement. Existing objects are skipped, decoded and checked for WebP/size. New objects are downloaded and compared by SHA256. Ordinary owner/session/window checks repeat before each insert.
- Storage API creates only the new objects' own metadata. No direct SQL writes. No leases/schema/new permanent access.

## Launch after scope review

1. Publish this reviewed patch to the existing owner-only Preview using the established workflow; verify SHA/READY/stable alias. Do not alter env/protection.
2. In the ordinary owner browser open the maintenance page. Save GET status before writing. Confirm 62 sources/124 destinations; preserve the original manifest outside the release too.
3. Click once, save the returned JSON receipt (source hash; destination hashes, dimensions, created/skipped outcome), return to the page and read current status. Repeat for the next incomplete original. Maximum 62 successful source batches for the current snapshot.
4. On any failure or lost response stop, inspect GET/status and saved receipts first. A subsequent request selects only still-missing destinations; do not reset or overwrite. A failed source prevents advancing silently past it.
5. Save final manifest, verify 124 present, and sample actual photographs in rental/purchase owner UI (including affected accessories 0003/0006). Existing execution-linkage exclusions and missing-source 6118 remain unchanged.
6. Remove the temporary maintenance page/API after verification in a cleanup release. It already denies access at the fixed expiry; do not prolong it.

No additional user grant for data/credentials is requested: this is another execution path for the approved 124 objects. Publication is deliberately pending the requested scope review. No Storage writes or new deployment were performed while preparing it.

## Local evidence

`node scripts/approved-derivatives-targeted.cjs` exercises the actual repair service with in-memory DB/Storage and actual Sharp output: manifest bounds, source preservation, duplicate/idempotent execution, permission/window failures, changed source metadata, missing original, uncertain upload with readback, partial completion/resume, expired/not-started window, and route origin/query/body rejection. This is offline evidence, not live Storage verification.

Typecheck passed. Lint passed with seven existing warnings outside this patch. Isolated Next build passed (exit 0, zero blocked network attempts, synthetic loopback configuration, no environment files or live DB). Evidence: `docs/evidence/approved-derivatives-20261021/build.json` and `build.log`.
