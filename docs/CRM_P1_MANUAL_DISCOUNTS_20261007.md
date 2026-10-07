# P1 manual discount workflow — 2026-10-07

Base: 6aac534500dc40e022ba427d44df8127a8d8db69 on review/crm-p1-integration.

## Delivered / reused Core

Reuses existing updateOrderItem/updateOrder, guardCommercialChange, integer totals, order events and synchronizeOrderChargeWithClient. No new discount service, pricing rules, percentages, promotion limits, schema or financial ledger.

Rental item editing now uses a retained action form. Server validation errors preserve amount, quantity, price and adjustment reason. The fixed discount is explicitly for the entire position, not per unit or percent. The UI shows gross, item discount and resulting amount. Remove remains the existing separate action.

Existing order edit shows gross, accumulated item discounts, order discount and resulting total. Existing internalComment can carry the order-level adjustment explanation (no new mandatory-reason rule). New rental and sale builders reuse the same breakdown and expose the already supported per-item adjustmentReason field.

Existing order events now retain discountBefore/discountAfter and the available adjustment reason/comment when discount actually changes. History renders only these validated fields. Earlier events are not reconstructed and the UI explains that older details may be absent. Currency formatting and arithmetic use integers; no rounding/rate conversion introduced.

## Access / lifecycle

ORDER_PRICE_OVERRIDE and ORDER_DISCOUNT_MANAGE remain independent. Seller default permissions do not gain either grant. Backend checks are the existing Core and branch checks, not client readOnly flags.

Existing restrictions remain: issued items/orders cannot be repriced through these paths; completed orders and confirmed sales cannot be edited. Confirmed rental adjustments retain charge reconciliation. The existing net-paid floor rejects a target below received payment net of refunds; it does not imply all paid-order edits are generally allowed/forbidden. No shortcut around refund/reconciliation, no changes to payments, saved document snapshots or historical financial records.

## Verification

- `scripts/discount-workflow-targeted.cjs`: 3 groups PASS using actual Core/permission/validation and financial synchronization with controlled adapters. Integer math, no rounding, large-number preview, event before/after/reason; seller/default and director override denial, excessive/negative discounts rollback; issued/completed/confirmed-sale restrictions, paid floor rejects without ledger writes.
- Local Chrome desktop 1440px/mobile 390px: 4 groups PASS on existing isolated synthetic draft. Excessive discount rejected with draft retained, valid change persisted and event checked, order edit breakdown, seller fields readOnly. Original synthetic item/order fields restored afterward; test order event remains as synthetic evidence.
- One focused additional browser group PASS: new rental/sale builders' common breakdown and mobile width; no new orders created in that check.
- Evidence: `../p1-discount-evidence/browser-result.json`, `builder-browser-result.json`, `discount-desktop.png`, `discount-mobile.png`; runners `../verify-p1-discount.cjs`, `../verify-p1-discount-builders.cjs`.
- Physical iPhone not tested. Paid-order refusal verified against actual finance function in targeted adapter test; no real payment/order mutation.
- Final isolated lint/typegen/typecheck/build: `../p1-discount-evidence/quality/result.json`.

Review routes: existing `/orders/<id>` → «Товары и редактирование» → position; `/orders/<id>/edit` for order discount; `/orders/new`, `/sales/new` for creation. Synthetic browser draft: http://127.0.0.1:62361/orders/05bd1c41-d1e1-449b-a7e0-c36c3518b9ab . P0/Production/real clients/photos untouched; no push/deploy. Existing next-env.d.ts excluded.

Final lint/typegen/typecheck/build: PASS on the single final run. Additional read-only mobile check opened the existing React accordion using its actual toggle and confirmed the new form is visible without horizontal overflow; evidence mobile-open-result.json and discount-mobile-open.png. Initial screenshot had the accordion closed; an incorrect details selector in the test was corrected. No implementation blocker remains.
