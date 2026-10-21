# Local release checklist — owner test through25October

Reviewed application base:6014031eaf93316b5f0f86087ecf9d11484c98c7, branch review/date-only-crm-integration-20261021. The next commit adds the explicitly approved local extension and this checklist. No public release claim.

## Local evidence already complete; not rerun just for this report

| Path | Evidence | Remaining acceptance |
|---|---|---|
| Rental catalogue/product -> date-only -> inquiry | DATE_ONLY_RENTAL_LOCAL_20261021.md:32period cases,32dialogue cases,390/430/1440calendar; owner-day ordinary inquiry/idempotency | Hosted UI/API persistence on new deployment |
| Purchase catalogue/product -> inquiry | SALE_CRM_DATE_ONLY_INTEGRATION_20261021.md:SALE-only prices, no rental dates, missingprice/stock gates,409/503retries, double submit mock | Real SALE SKU/price coverage and hosted inquiry |
| Inquiry -> notifications -> compact CRM | PURCHASE_INTENT_CRM_20261021.md:actual service/persistence-helper data into CRM fixtures;5states; tenant/branch/permission scope | Existing real record displayed by updated deployment |
| Purchase inquiry -> existing sale form -> linked sale/backlink | INQUIRY_SALE_LINKED_WORKFLOW_20261021.md:7groups; actual route/form/action/source wrapper, transactional in-memory DB/lifecycle boundary; no GET write; source version/idempotency/rollback | Real lifecycle remains unexecuted under current no-business-write constraint; not a live E2E proof |
| Colors and main actions | Color regression; CRM390/1440and rental/purchase390/1440screenshots in integration evidence |12live corrected cards after alias/deployment verification; previously6showed new DB text and6old frontend descriptors |
| AI context/recovery | Offline variants, relative dates, context, reviewer grounding and noresults covered in earlier reports | Live paraphrase/model quality on the final SHA has not been demonstrated; fixture replies are not model training |

Confirmed rental semantics:pickup date+Ndays -> return date;22–23Oct is one day,22Oct+2days returns24Oct. Availability interval15:00pickup to12:00return, branch timezone, existing turnaround buffer. Issuance15–20is a condition, not a time input. Today at/after20requires staff; not reported as no-stock. Old CRM timestamps/tariffs untouched.

## Approved extension — local code only

Original fixed start remains2026-10-20T19:00:00Z. New exclusive end2026-10-25T19:00:00Z =26Oct00:00Asia/Almaty; includes all of25Oct. Existing MARIPOSA_OWNER_DAY_TEST=main-2026-10-21 flag retained intentionally, so existing configuration identity and today's ledger are not reset. Exact project/ref/MAIN tenant/OWNER membership/permissions unchanged.

Daily engineering ceiling remains $2 and100provider calls (not100chat messages). SQL counts attempts from the later of original start and DB-current civil midnight in Asia/Almaty; preserves every prior row. Existing rolling-minute/hour and concurrency restrictions remain. Reservation per call18,475,600nano;100calls reserve1,847,560,000nano below2,000,000,000nano. This is application admission control, not a new provider billing-account cap or a claim about actual spend. Model/key/tariff snapshot unchanged.

Additional smoke disabled outright. Historical smoke still counts in its original day. New unresolved leases persist through the full extended window; unresolved original leases ending21Oct19UTC also continue to block after that time, rather than silently being forgiven. No lease/ledger was modified in a real database.

New synthetic checks:all5day limits, just-before/at Almaty midnight using DB clock, unchanged old ledger, 100/101 boundary, retained unknown leases across days and original end, new-smoke denial, final expiry, exact owner/session/tenant guards, history/inquiry write-window rollback, resource bindings.10groups PASS; no scripted provider call needed.

At current published code's old expiry21Oct19UTC, catalogue/selection/photo, ordinary inquiry, AI/history/handoff gates close. DB/Storage resolver also requires a valid owner window, so cold starts/builds using the old owner-day configuration can fail closed. A logged-in session does not extend it. Ordinary session expiry/revocation stays independent even after extension; owner may need normal login. Once updated code is published, all these gates use the new end together. No deletion of history/inquiries occurs on expiry.

## Blocking release gates

- [ ] Publish/verify final integrated SHA through authorized Vercel access. Prior deployment-list403 remains; no retry/alternate API/CLI/bypass performed. Existing stable URL deployment SHA is not asserted from stale information.
- [ ] Verify READY and stable URL points to that SHA, with owner-only/WAF/protection intact. New extension is NOT applied on the hosted site yet.
- [ ] Verify ordinary owner login and guest/foreign denial on catalogue/photo/selection/purchase/history/inquiry paths at new deployment. Never substitute a bypass for login.
- [ ] Read current provider ledger before any future authorized AI use; historical12calls/1smoke is not a current count. No additional smoke permitted. Do not reset rows or unresolved attempts.
- [ ] Hosted read-only acceptance:rent/purchase prices/availability, date range,12colors, existing CRM request and notification. New real transactions require their own allowed test scope; current local task authorizes none.

For applying extension, existing branch env flag/tenant/member/key/model settings need no change if unchanged from the approved configuration. The necessary change is the code deployment. If actual branch configuration differs, inspect through ordinary authorized access and report it; do not rewrite secrets/auth or broaden audience. No new security-sensitive permission was required for local preparation. No push/deploy/env or real DB mutation was performed.

Inherited limitation:purchase intent uses existing WEBSITE subject/text prefixes, not an immutable schema field; manually removing both markers removes classification. No migration requested or performed. Assistant panel redesign remains paused for owner choice; messaging-channel rollout is outside this release. These are not silently declared completed.
