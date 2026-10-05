# Customer order activity: existing-data UI

Independent branch review/crm-customer-order-activity, base 8d6dd1ef63f7c2619be17ab5a9b14cc577d35a67. No changes to frozen release 09c51a7, purchase report 8d4e909 or audit viewer 83bb17d. Existing PILOT guard preserved; transfer only the reviewed feature commit to a suitable authorized production base, not the entire branch.

## Accepted implementation checked first

CRM_1_0_STATUS item 6: customer contacts/notes, order/payment/deposit history and saved rental documents already exist; there is no unified interaction timeline. Existing customer card and /customers/[id]/orders display order lists. lib/orders/queries.ts already selects OrderEvent within a single order; app/orders/[id]/page.tsx renders these with orderEventLabel/orderStatusLabel. Saved-document customer UI d2e571f and snapshot/current-branch security 32725ad are retained unchanged. Inquiry has no customerId relationship, so matching by phone/name is not a valid existing association.

This change is a bounded useful part of that gap: saved order events across this customer's accessible rental/sale orders, linked from the existing Orders section. It is not a full conversation/payment/note/document timeline. It introduces no event writer, schema, binding, financial operation or legal document/term.

## Completed flow

Customer card -> History of events -> /customers/[id]/activity. Uses existing event/status/type labels; recorded timestamps, current actor display name, order number/link, type, current branch and recorded from/to statuses. Existing unknown-event fallback retained with the raw stored code; inherited dictionary properties are not mistaken for labels. Filters: inclusive UTC calendar days by OrderEvent.createdAt (time of recording), and RENTAL/SALE type. Not rental dates, payment dates or inferred physical occurrence times.

OrderEvent has no branch snapshot. Access and displayed branch follow the current order; user display names/order links are current references. Page labels this boundary. Current catalog eligibility/archive/operation flags do not filter historical events. Archived customers remain readable under existing CUSTOMER_VIEW semantics.

## Access and pagination

CUSTOMER_VIEW and ORDER_VIEW are both checked by the card link, page and service. Existing role defaults/explicit ALLOW/DENY unchanged. Tenant/actor mismatch rejected; customer ID is validated and the customer loaded only within the trusted tenant. accessibleBranchIds refreshes active membership/branch grants, rather than using session-cached IDs. Each event is scoped by both its tenant and related order tenant/customer/current accessible branch. No accessible branches gives an empty list; missing/foreign customer gives not found.

Selects omit payload, amounts, order items, contact/notes/address data, emails and financial ledger/deposit records. No Inquiry lookup or fuzzy customer matching. Cursor is resolved under the same tenant/customer/current branch/type/date filter; foreign/stale/filter-incompatible cursor fails closed with a reset link. 51-row bound, 50 rendered, keyset (createdAt DESC,id DESC); same-time events from different orders traverse without duplicates or loss. Newer inserts do not duplicate previous pages. It is a live list, not a frozen historical export.

## Local validation

node scripts/customer-order-activity-mock.cjs: 14/14 PASS, actual service, permission/branch helpers, existing label functions, page SSR and card-link SSR. Synthetic read proxy rejects unexpected models/writes. Includes tenant/permission/inactive-member/branch boundaries, foreign customer/cursor, strict filters, same-time multi-order pagination, newer insert, payload/financial-data exclusion, HTML escaping, empty/error/not-found and navigation. Card integration also checked by its exact component insertion and build; no claim of full-card browser E2E.

Prisma generate, standalone typecheck, scoped ESLint and git diff check: PASS. Default Next 16.3.3 build: PASS, 43/43 static-generation tasks, with dynamic /customers/[id]/activity included. Existing customer-documents mock: 9/9 PASS. Final outcomes recorded in the external checkpoint. Dummy unreachable loopback DATABASE_URL; no real clients, database connections, migrations, messages, financial operations, secrets or photo changes. Full security/browser/business acceptance remains deferred.

No push/deploy or Vercel workaround. Broader Inquiry/customer linkage needs an explicit data relationship and agreed workflow. Legal sale/withholding forms require owner-approved wording; this feature invents neither.
