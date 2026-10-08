# CRM UI candidate: regression closure

Supersedes the legacy regression limitation in CRM_UX_REVIEW_20261008.md. UI implementation commit: b77bc2fa7489c360672a82e724e3f7f29c29aee1. Base release: 468280c8d6ff91fd8e0df89373ef6908554638f3. Integration branch: review/crm-p1-integration. No application business logic, permissions, ledger, schema or migration changed in this follow-up.

## Diagnosis and verified corrections

All nine failures reproduced on the released base were test harness/fixture/expectation defects. No Core, security or finance implementation defect was demonstrated by these failures. This conclusion applies to these scenarios; it is not a claim of exhaustive security coverage.

| Script | Classification and correction | Preserved verification / risk addressed |
|---|---|---|
| audit-log-view | Impossible duplicate ALLOW/DENY override fixture violated the database unique permission key. Replace with one DENY. Share host Error with VM; expect actual early PermissionError for inactive owner. | 15 scenarios: role/override denial before audit reads; fresh tenant/branch filtering; bounded pagination; redaction. |
| catalog-operation-policy | Strict module allowlist lacked existing member permission resolver; VM Error constructor mismatch. | 12 scenarios and 432 matrix cases: sale/rental/stock flags, reservations, policy transitions. No policy change. |
| crm-permission-invariants | Strict allowlist lacked member resolver and cash-account-link helper; VM Error mismatch. | 6 scenarios: inquiry denial, tenant isolation, deposit receipt versus withholding permissions, ledger conservation and zero-debt issue. |
| crm-read-scope | Allowlist incomplete; hard-role expectations obsolete after configurable capabilities. CASHIER now has cash-account visibility, so the no-family fixture must explicitly deny every family. | 11 scenarios: default role denials remain; authorized explicit grants are checked for allowed families/fields/branches; per-family DENY, empty scope, OWNER invariant, foreign/inactive membership, real XLSX roundtrip. No-family dashboard must return empty arrays and no visible kinds, export 403, zero financialTransaction reads. |
| customer-documents | Allowlist and relative import resolver incomplete; nullable permissionRole fixture missing and projection did not support null. | 9 scenarios: both customer/order permissions, saved version and print authorization, moved-order branch checks, tenant and malformed cursor denial before document reads. |
| customer-order-activity | VM class Error mismatch; inactive membership now fails at the earlier permission check. | 12 scenarios: strict early rejection, no customer/event reads on denial, tenant/branch scope and pagination. |
| inquiry-reply-contact | Strict allowlist lacked member resolver; VM Error mismatch. | 14 scenarios: authorized inquiry action/UI, foreign tenant/branch denial, reply contact create/update/idempotency and concurrent mock misses, no financial model reads or external calls. |
| order-list-filters | Strict allowlist and relative module resolution incomplete. | 6 scenarios: actual query/page/export, scoped branch/status/type/channel/search, timezone bounds, pagination and XLSX. |
| sale-report | Strict allowlist and relative module resolution incomplete; VM Error mismatch. | 6 scenarios: charge/reversal/discount provenance, deposits excluded from revenue, date/DST filters, branch scope and explicit DENY. |

All allowlists remain explicit; no database/network clients or secrets loaded. Assertions requiring denials and no unauthorized reads remain. Role-name rejection was replaced with assertions for the existing configurable capability policy, not with unrestricted access.

## Final verification

Each affected script passed targeted checks. After the final repair, one complete mock regression run passed **15/15 scripts**, including staff-notification-scope. Result and individual logs: workspace ux-regression-closure-evidence/regression-result.json. Original failures and released-base comparison remain preserved separately in ux-refresh-evidence.

The previously completed final build/typecheck and browser flows for b77bc2fa still apply: this follow-up changes only tests/documentation. No redundant build was run. Browser evidence covers desktop 1440px/mobile 390px, claim confirmation/payout idempotency, manager branch scope, future-date rejection with retained input, payment and expense form recovery, and quick search. Physical iPhone remains untested. The original local CRM on 62369 and its passwords were not changed by this follow-up. Review instance remains on 62380 with its separate synthetic database.

## Library images

All eight synthetic PNG creates succeeded in ChatGPT Library, version 0. Windows lacks os.setxattr, so local xattr persistence failed; file identities/version/local paths are saved in workspace ux-library-evidence.json instead. This does not invalidate the successful Library writes.

| Image | library_file_id |
|---|---|
| MARIPOSA_Main_desktop.png | libfile_92801bdb6ae481919b8dc41b3c5b46f3 |
| MARIPOSA_Main_mobile.png | libfile_6366837f583c8191ac229a58171abce8 |
| MARIPOSA_Cash_desktop.png | libfile_66a51e7a3a708191be7860955cd8c5c4 |
| MARIPOSA_Cash_mobile.png | libfile_cf30bfb964188191893bdc534f6af89f |
| MARIPOSA_Payroll_desktop.png | libfile_6a8fc4fbd3b48191a785f7a6433999e3 |
| MARIPOSA_Payroll_mobile.png | libfile_cc57932df73c8191b7b1eb0370f67c0e |
| MARIPOSA_Permissions_desktop.png | libfile_6177cc2faf5c8191b4fd0a5bd551a2b2 |
| MARIPOSA_Permissions_mobile.png | libfile_fbd6b0a61f588191a49e237c190f54c8 |

## Integration boundaries

Candidate is local and unpushed; draft PR not created. Parent can integrate this commit on the same review branch. No new business decision or schema change was required to close these failures. No Production, Vercel, live database, live Storage/photo upload, security setting, password or site/showroom changes. Acceptance and Production publication remain separate owner decisions.
