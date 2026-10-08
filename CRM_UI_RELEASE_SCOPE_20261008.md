# CRM UI release scope

Release series based on the already live 468280c8d6ff91fd8e0df89373ef6908554638f3 and local UI candidate cc3a71e772bec84116326f236dede7a1f7dedd55. Owner authorized completing and publishing the UI on 2026-10-08; per-screen visual approval is no longer required. This document describes the UI release, not completion of every GAP item.

## Five owner findings

| Finding | Candidate implementation and evidence |
|---|---|
| Expected versus actual returns | Upcoming and notification queues explicitly say “Ожидаем возврат”; the separate daily physical movement section says “Фактически выданные и возвращённые товары”. Receiving a return remains an explicit existing operation. No physical/financial state is inferred from a scheduled date. |
| Past-date shift | Employee work-date entry permits a past worked day; server still rejects future days. Existing isolated browser evidence records the past claim, retained rejected input, and one planned past shift. No payroll entry is created by claiming a shift. |
| Manager notification | Pending shift claims appear only with PAYROLL_VIEW and PAYROLL_CONFIRM, using fresh tenant/branch scope and a link selecting the exact employee/branch. Notification mock and owner/director isolated browser scope checks passed. |
| Understandable rate setup | Employee selection exposes a titled rate panel and a “Задать ставку” path before confirmation. Confirmation displays calculated rate/date, requires payment method and explicit approval of already paid money, and retains existing rate-version/idempotency checks. No arbitrary employee-entered salary is introduced. |
| Convenient cash | Contextual entry forms, retained validation input and compact 390px rows keep amount/actions visible. Full IDs remain in details. Payment, expense, reversal and ledger semantics are unchanged. |

## Additional mobile correction before release

The customer list still had a hidden 850px minimum width. It now uses bounded responsive columns; customer name/contact/status stay within 390px. Desktop columns also shrink safely. Long display references are compact in customer and order lists/board; their full record links and full detail references remain unchanged. The strict order-list test allowlist includes the existing pure display helper.

Targeted checks: order-list-filters 6/6; separate synthetic browser verified dashboard, orders list/board, rental card/new form, customer list/card/new form at 1440px and 390px, expanded order filters, and real GET order/customer search. Screenshots are retained only in workspace evidence, not sent for owner approval. Targeted lint passed. Prior cash/payroll/permission browser checks and prior 15/15 complete mock regression are retained and not repeated for counts.

## Controlled publication boundary

Use one final exact-commit archive build, then stage production in existing Vercel project prj_FSsQxUktUBH9VNCGeadBoNnzlD1W without automatic domain assignment. Verify READY/project/candidate metadata before promotion and independently verify both operational aliases and public app responses after promotion. Rollback deployment is dpl_3MBe7j3qCpkUPNzybgT24QDvvDwz (468280c8), already READY and serving both operational aliases before this release.

This series has no schema, migration, package/dependency, Storage/upload handler, financial writer, auth/security setting or secret changes. Seven existing live migrations must not be repeated. No maintenance/writer barrier is needed for this backward-compatible UI release; no photo upload is performed as a test. All new browser activity and auth fixtures are isolated; no real financial test writes. Preserve foreign next-env.d.ts changes and do not merge main or trigger an unnecessary Git auto-deployment. Owner will perform final real-world acceptance after publication; physical iPhone remains untested.
