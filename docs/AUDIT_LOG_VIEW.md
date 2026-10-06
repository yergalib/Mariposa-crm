# Existing audit log viewer: independent CRM 1.0 scope

Branch review/crm-audit-log-view, base 8d6dd1ef63f7c2619be17ab5a9b14cc577d35a67 (before operation-policy migration). Independent of purchase report 8d4e909 and frozen release 09c51a7; no schema, financial ledger, stock or writer changes. Existing PILOT tenant guard preserved; do not deploy this entire base branch to Production.

## Confirmed gap and accepted foundation

CRM_1_0_STATUS matrix item 5 lists permissions and audit foundation as partial. Git history 351154c (Stage 9A) already added AUDIT_LOG_VIEW, appendAuditLog/sanitization, listAuditLogs, AuditLog schema, tenant guard and immutable history. Before this change, app/lib had no caller of listAuditLogs; only stage-9a-targeted.ts called it. No audit-view app page existed in Git history. This closes the missing staff viewing workflow, not the full security audit.

The accepted lib/audit/log.ts writer, lib/audit/queries.ts legacy helper, financial services, Prisma schema, migrations, permission registry/defaults and audit triggers remain unchanged. No attempt to manufacture missing events or backfill history.

## User flow and displayed data

Settings -> Journal of actions, visible only with effective AUDIT_LOG_VIEW. /settings/audit checks authentication/route access and that permission server-side. Viewer columns: UTC event time, current actor display name, current branch name, recorded action code, entity type/reference, result and source. No arbitrary metadata, amounts, notes, email, correlation IDs, passwords or tokens are selected/rendered. UI shows recorded events; it does not assert every historical business action was logged.

Filters: inclusive UTC calendar days by occurredAt, branch, exact action/entity-type codes, SUCCESS/DENIED/FAILED result, CRM/API/SYSTEM source. Strict calendar/date/order/enum/length/UUID and duplicate-param validation. Invalid filters/cursor give a recoverable reset link, without fetching a page of events. Native labelled form, caption/scoped headers, escaped server-rendered text and horizontal overflow for the table; no client component/heavy client library introduced.

## Permissions and pagination boundary

No new permission or default grants: OWNER default retains AUDIT_LOG_VIEW; DIRECTOR/SELLER/CASHIER need existing explicit ALLOW. Existing OWNER invariant preserved. Tenant/actor mismatch is rejected before reads. accessibleBranchIds reads active membership/fresh branch grants; cached session branch IDs are not trusted for data scope. Explicit inaccessible branch is rejected.

Organization-wide readers may see branchless/archived-branch events. Branch-restricted readers see ONLY their accessible branch IDs; branchless events are excluded because there is no proven branch association. This conservative new-page policy does not rewrite the legacy listAuditLogs helper or widen existing rights.

At most 51 rows fetched, 50 displayed. Stable keyset ordering occurredAt DESC / id DESC, scoped cursor lookup and strict (time,id) boundary; no unscoped Prisma cursor/offset. Cursor must exist under the current tenant/branch/filter constraints. Unknown, foreign, newly inaccessible or filter-incompatible anchor fails closed. Pagination retains filters; resubmitting the form starts at the beginning. Newer inserts do not duplicate previously displayed rows; this is a live immutable-event list, not an exported historical snapshot.

## Local verification

node scripts/audit-log-view-mock.cjs: 14/14 PASS with actual read model, actual permission registry/effective and branch helpers, and actual React server pages. Synthetic proxy permits only expected reads and rejects unexpected database models/writes. Cases cover role defaults/ALLOW/DENY, inactive OWNER, tenant/branch/null-branch boundaries, exact filters/calendar limits, same-time 112-event traversal, concurrent newer insert, inaccessible/foreign cursor, metadata exclusion, HTML escaping, empty/error states and permission-gated settings link.

Prisma generate, standalone tsc --noEmit, scoped ESLint and git diff --check: PASS. Default Next 16.3.3 production build: PASS, 44/44 static-generation tasks; /settings/audit included as a dynamic authenticated route. Final result is recorded in the external verification checkpoint. Dummy unreachable loopback DATABASE_URL, no live database/client data, external calls, secret loading or migrations. Full browser/security E2E remains deferred; this scope does not claim visual/business acceptance or live deployment.

Vercel access remains blocked (Unknown tool after reconnection); no retry/workaround, push or deploy. Photo uploads and running CRM left untouched.
