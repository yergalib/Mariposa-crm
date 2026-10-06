# Safe CRM Preview integration

Branch review/crm-safe-preview-integration, exact published base 32725ad220f3a31fce9c1f5eb4c17d8c2c4b561a. Four approved feature deltas:

- 8d6dd1e -> 68f9a14: shared validated UTC rental-overlap filters for orders UI/XLSX; SALE dates remain undefined/rejected rather than guessed.
- 8d4e909 -> c6d5551: bounded permission/branch-scoped purchase/actual-receipt XLSX with exact currencies/amounts and no cash-expense claim.
- 83bb17d -> ea44606: read-only audit viewer under existing AUDIT_LOG_VIEW; no metadata/financial payload selected.
- 3262734 -> 224f3cb: read-only customer order-event history under CUSTOMER_VIEW + ORDER_VIEW; no fuzzy Inquiry/customer linkage.

Runtime files for each delta match their source commit exactly. Only cherry-pick conflict was appended docs/CRM_1_0_STATUS.md; both audit/customer sections retained. Original worktrees preserved.

## Dependency proof and publication boundary

Relative to 32725ad, Prisma schema and every migration, lib/auth/session.ts, lib/tenant, lib/permissions, lib/db.ts, lib/env.ts, package.json/lock and saved-document implementation are byte-equivalent. No new nullable operation-policy fields, resolver/guard, operation-policy migration, workbook/import executor, seed/reset or live SQL included. No migration dependency is introduced; new selectors reference existing models/fields from the published base.

Prior PILOT-only guard remains active: only de1e9e01-c7ad-45fc-899a-d2287f771355, and VERCEL_ENV=production rejected. This is a non-production Preview branch, not a Production promotion. No Main/ref/Production/DB/secret/permission/photo changes authorized or performed. Publish only this feature branch through the existing GitHub Git-connected Preview path; no alternate authentication or route after any permission rejection.

## Joint local validation

102/102 synthetic mock scenarios: order filters 6, purchases 14, audit viewer 14, customer events 14, saved documents 9, sale report 6, inquiry reply contact 14, permission/finance invariants 6, catalog/finance read scope 11, customer contacts 8. Actual services/UI/XLSX are used with allowlisted synthetic dependencies; no real client/database/external/financial/message operations. Prisma generate, standalone tsc --noEmit, scoped lint and diff-check passed. Default Next 16.3.3 Turbopack build passed, 46/46 static-generation tasks, all new dynamic routes present. External verification checkpoint records final publication separately. Dummy unreachable loopback DATABASE_URL, blank API/Supabase keys; no env files copied or migrations executed.

Vercel known-deployment read currently returned a tool error after reconnection, so cloud access/status is not presumed. Git push and cloud deployment outcomes must be reported separately and confirmed; never label a deployment READY from a local build or an old URL. Full live/browser/business/security acceptance is not claimed.
