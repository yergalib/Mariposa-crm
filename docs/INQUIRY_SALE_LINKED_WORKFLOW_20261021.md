# Inquiry to existing sale workflow — local checkpoint

Supersedes the manual re-entry limitation in PURCHASE_INTENT_CRM_20261021.md. Base bafbfd1. No schema migration or new permissions.

Path:
1. Purchase inquiry detail links to /sales/new?inquiryId=<id>. URL supplies only identity; all inquiry/branch/customer/item data and fresh SALE quotes come from scoped server reads.
2. Existing SaleOrderForm receives branch, item variants/size/current price, quantity1, responsible member and inquiry version. No record is created on GET. A customer is selected if already linked; guest contacts are not copied. Unavailable catalog entries are explicitly listed; serialized products still need a concrete instance. Cancel returns to the inquiry.
3. Only the existing explicit Create sale submission runs creation/confirmation. New source wrapper rechecks current permissions, tenant, branch, purchase marker, closed state, version and assignee. It shares inquiry-conversion locks with rental/fitting workflows. Branch and channel come from the authorized source; source is not trusted from payload.
4. Existing createSaleDraft/confirmSale remain unchanged and run inside the same transaction, retaining current price/override/discount, customer, item and inventory checks. On success only, inquiry.orderId/customerId/status ORDER/version and audit are saved. Standard confirmation reserves for handover as before; this is not automatic payment or physical issue. No new financial rule introduced.
5. Stable server key inquiry-sale:<id> plus existing lifecycle payload checks prevent repeated/concurrent creates. Existing link with another type/key/customer/assignee is rejected. Failed confirmation rolls back source and order together. Prefill after success offers the linked sale, and sale detail offers a permission/branch/tenant-scoped backlink to the source inquiry.

Verification:
- scripts/inquiry-sale-workflow-targeted.cjs PASS7groups: actual prefill route, actual SaleOrderForm markup, actual server action and source transaction wrapper, with in-memory DB and lifecycle boundary. Verified source/version/branch/items/price fields, no GET writes, direct action/replay/concurrency, source key/channel, link/status/audit, rollback on injected price/stock failure, no false success redirect, stale/closed/foreign/permission/type/mixed-source denials, missing item, standalone and fitting dispatch, linked sale and return-to-inquiry path.
- Important evidence limit: price/stock rejection is injected at existing lifecycle boundary in this suite; it does not execute real stock/finance writes or prove production database behavior. Production lifecycle modules were not changed.
- CRM fixture5states with capture of actual showroom purchase record passed; sale link carries inquiry ID and permission denial hides it. Purchase7groups, purchase-to-rental guard, date-only32, assistant recovery13 and notification isolation regressions PASS.
- Final typecheck/lint/build exit0 with offline guarded synthetic configuration; affected source/helper/components separately linted with0errors.

Artifacts: integration-inquiry-sale-evidence/targeted.json, verification.json, build.log, crm/fixtures.json, notifications/targeted.json. No real sales/orders/inquiries, payments, stock/cash writes, paid calls, push/deploy, env/access changes. Vercel403 was not queried/bypassed. Hosted acceptance remains pending authorized publication/access.

Remaining inherited limitation: purchase intent is recognized from existing server-written WEBSITE subject/text prefixes, not an immutable schema enum. No migration performed. Removing both prefixes manually removes that classification.
