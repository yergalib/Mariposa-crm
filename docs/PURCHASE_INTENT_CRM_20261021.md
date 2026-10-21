# Purchase intent through CRM: local regression and repair

Base4a83bc62. Confirmed defect: the purchase inquiry detail used the shared rental ConversionForm, offered "Создать заказ аренды" and requested rental dates. The rental conversion command did not distinguish showroom purchase intent.

Repair:
- Recognize existing WEBSITE purchase prefixes in subject/requestText; no schema enum or migration. Either server-written prefix suffices, so editing one still retains recognition. This compatibility classifier is not an immutable typed database field: removing both prefixes loses the marker. It never grants permissions.
- Detail explicitly identifies purchase, omits rental-period display, and offers /sales/new only with existing LEAD_CONVERT_TO_ORDER + ORDER_CREATE + SALE_CONFIRM permissions. Existing linked order remains readable only with ORDER_VIEW. No rental conversion panel for purchase.
- Rental command rejects direct purchase inquiry and a fitting linked to it before order creation, keeping existing scope and permissions checks. Ordinary rental path unchanged.
- Existing sale form is a separate explicit confirmation. This link does not prefill items, create, link or mark an inquiry converted. Staff reselects customer/branch/item and checks current price/stock; UI states this limitation. Automatic direct inquiry-to-sale association/idempotent conversion needs separate business-logic work; not silently implemented.

Evidence chain (all synthetic):
1. Actual showroom service + contracts -> actual createInquiryRecord -> mocked inquiry.create. Exported exact write data to integration-purchase-intent-evidence/record.json: WEBSITE, purchase subject/prefix, SKU/productVariant/size snapshot, quantity1, server price/currency, null requestedFrom/Until. Audit dependency mocked; no real persistence.
2. The captured subject/text/items/null dates feed actual CRM detail JSX. Five states render; purchase and server price visible, rental form absent, SALE_CONFIRM denial removes sale link. Actual staffNotifications emits purchase subject and existing inquiry href; no false overdue. Tenant/branch/notification regressions pass separately.
3. Actual convertToRentalOrder with scoped synthetic transaction rejects purchase direct and via fitting before the writer. Denied permissions still reject; ordinary rental reaches only a rejecting stub writer.
4. Actual browser InquiryForm with controlled503: no false receipt, locked contact, retry sends identical payload/creationKey. Controlled409: no false receipt, edit/recheck allowed, old availability cleared and submit disabled until recheck.
5. Existing actual-service purchase tests reject changed/missing price and unavailable stock before mocked writes; duplicate concurrent submission writes one mock inquiry; same-key retry returns original after price change, altered payload rejected.

PASS: purchase7groups, conversion guard, CRM5states, notification text/permissions, reply-contact16cases, date-only32cases. Isolated browser CRM390/1440:10checks, no overflow, contrast/touch/focus; mobile screenshot inspected. Final typecheck/lint/build0, offline guarded build; affected conversion/helper/CRM files lint0. No live DB/provider/real inquiries or orders.

Evidence directory integration-purchase-intent-evidence contains record.json, CRM fixtures/render and390 screenshot, browser retry.json, verification.json/build.log. Run purchase-targeted with PURCHASE_RECORD_FILE=integration-purchase-intent-evidence/record.json, then crm-mobile-fixtures with same file and INQUIRY_EVIDENCE_DIR; conversion-guard uses that file. Browser retry fixture uses port8878 and is stopped after checks.

No push/deploy/access/env/budget or real stock/cash change. Vercel403 not queried/bypassed. This is local service/component testing, not live CRM sale acceptance.
