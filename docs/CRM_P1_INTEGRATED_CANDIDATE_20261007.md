# P1 integrated local candidate — 2026-10-07

Branch/worktree: `review/crm-p1-integration`, `mariposa-crm-p1-warehouse`.
Frozen P0 remains `5bbbec5afffbb99b3ab2de2a80d343a50991f0b1` in its separate checkout; the P0 production plan awaiting Vercel login is not replaced by P1. No push/main/deploy/live migration/data/photo/environment/security changes in this continuation.

## Completed main blocks

| Block | Local evidence / scope |
| --- | --- |
| Warehouse views | `CRM_P1_WAREHOUSE_20261007.md`; accepted stocktake/Core reused |
| Connected customer card | `CRM_P1_CUSTOMER_CARD_20261007.md` |
| Staff tasks | `CRM_P1_STAFF_TASKS_20261007.md`; only its migration is new to the P1 schema, applied to isolated DB only |
| Audit filtering and safe links | `CRM_P1_AUDIT_VIEW_20261007.md` |
| Product/size analytics | `CRM_P1_PRODUCT_ANALYTICS_20261007.md`; historic utilization/product-level money explicitly unavailable |
| Inquiry cohort funnel | `CRM_P1_INQUIRY_FUNNEL_20261007.md`; saved links, selected branch/org business timezone |
| Future document identity and preserved snapshots | `CRM_P1_DOCUMENT_SETTINGS_20261007.md`; no new legal text, old V1 renderer preserved |
| Manual discount workflow | `CRM_P1_MANUAL_DISCOUNTS_20261007.md`; existing pricing/permission/payment constraints |
| Catalog reference settings | Existing category/size CRUD repaired below; no replacement dictionaries |
| Internal rental read API | `CRM_INTERNAL_RENTAL_API_V1.md`; actual authenticated Core adapter, no public/channel or write API |

Existing organization/branch/location/payment-method settings and turnaround buffer already work through `lib/settings-business.ts` and `/settings/business`. They were not rebuilt. Categories and sizes already had Core CRUD; concrete gaps were repaired: four actions redirected to nonexistent `/settings/catalog`; dimensions were absent from edit form and could be cleared; DRAFT category status was missing from its select. Actions now return inline errors retaining input, use `/products/settings`, display existing height/length/custom system/status, and settings navigation exposes the existing screen. Existing financial/staff/catalog policies remain the authority. No schema additions in the final continuation.

## Focused new verification

- `scripts/reference-settings-targeted.cjs`: metadata preservation, DRAFT/custom system, correct redirect, inline errors, denied mutations.
- `scripts/rental-read-api-targeted.cjs`: 3 groups, actual local-time helper, strict/duplicate inputs, scoped/no-cache projected DTO, errors and authorization sequencing.
- `../p1-completion-evidence/browser-result.json`: 3 groups PASS. Real synthetic size creation/error retention/rename, preserved dimensions, desktop/mobile, actual Core API call, duplicate 400, anonymous 401, unchanged audit fingerprint. The only newly created synthetic size was deleted afterward.
- Final candidate aggregate: 10/10 selected mock/permission suites PASS. Evidence is in `../p1-completion-evidence/aggregate/`; no broad DB rerun or replay of accepted Core/P0 scenarios.
- One final isolated lint/typegen/typecheck/build: `../p1-completion-evidence/quality/`.

Runtime: http://127.0.0.1:62361 . Synthetic P1 data only. Main remaining review screens: `/products/settings`, `/settings/business`, `/settings/documents`, `/reports/products`, `/reports/funnel`, `/tasks`, `/settings/audit`. The API works with the current CRM session at `/api/v1/rental/branches` and `/api/v1/rental/availability`.

## One consolidated business decision list

1. Cash desks / income and expense categories: approve the actual cash/bank/terminal entities, branch/currency ownership, opening/closing and transfer/correction approval workflow, categories, and how these operations map to the existing ledger. Payment methods alone are not cash-desk accounting. No financial postings or tax rules were invented.
2. Shifts: define whether the scope is planning only or attendance, branch/staff/timezone and approval rules. Breaks, pay, payroll formulas and taxes remain unspecified and unimplemented.
3. Additional operational/legal documents: name the required document types and supply approved fields/text/numbering/signature requirements. Current working sheet and unsigned versioned rental documents are available; no fabricated invoice, receipt, act or legal terms added.
4. Automatic notifications: approve event triggers, recipients/consent, templates and delivery provider/cost before any real delivery. No scheduled messages, credentials or paid services were activated.

These decisions do not block the completed local P1 surfaces. They block claiming the corresponding unapproved business modules complete. Full versioned mutation APIs and external channel authentication/delivery remain outside this local read-only API increment, not implemented placeholders.

## Explicitly deferred / not claimed

Separate cleaning/repair queue was rejected by the owner. Showroom/site, WhatsApp/Telegram/AI/omnichannel and P2 remain frozen. Historical utilization/idleness, past-time funnel reconstruction and per-product revenue allocation remain unavailable without trustworthy data. Physical iPhone/physical printer acceptance is not replaced by Chrome mobile tests. No real-data acceptance or Production readiness is inferred from local results.

Before any P1 Production release: owner acceptance of this separate candidate, explicit release authorization, existing release gates and a reviewed migration plan for StaffTask are still required. This does not authorize changing the P0 release candidate. The pre-existing local `next-env.d.ts` modification remains unstaged.

Final outcome: the single final isolated lint/typegen/typecheck/build run PASS; aggregate 10/10 PASS. All independently implementable main blocks identified in the agreed remaining scope are complete as a local candidate. Unspecified cash/expense/shift/legal/notification policies remain explicit decisions, not implemented placeholders.
