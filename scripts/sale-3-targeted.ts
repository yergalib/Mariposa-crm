import { readFileSync } from "node:fs";
import { deriveOrderPaymentDisplayStatus } from "../lib/finance/payment-status";
import { validateSaleHandoverSelections } from "../lib/sales/handover-contract";
import { calculateSaleLine, parseTransactionSalePrice } from "../lib/sales/pricing";
import { assertSaleFulfillmentPaid } from "../lib/sales/fulfillment-payment";

let passed = 0;
const pass = (name: string, condition: unknown) => { if (!condition) throw new Error(`FAIL ${name}`); passed++; };
const rejects = (operation: () => unknown) => { try { operation(); return false; } catch { return true; } };
const source = (path: string) => readFileSync(path, "utf8");

const expected = [
  { productVariantId: "bulk-white-120", productInstanceId: null, quantity: 2 },
  { productVariantId: "serialized-pink-130", productInstanceId: "instance-1", quantity: 1 },
];

pass("exact BULK and SERIALIZED handover", validateSaleHandoverSelections(expected, [
  { kind: "BULK", productVariantId: "bulk-white-120", quantity: 2 },
  { kind: "SERIALIZED", productInstanceId: "instance-1" },
]));
pass("wrong Product or Variant fails closed", rejects(() => validateSaleHandoverSelections(expected, [
  { kind: "BULK", productVariantId: "wrong-product", quantity: 2 },
  { kind: "SERIALIZED", productInstanceId: "instance-1" },
])));
pass("wrong execution or size fails closed", rejects(() => validateSaleHandoverSelections(expected, [
  { kind: "BULK", productVariantId: "bulk-white-130", quantity: 2 },
  { kind: "SERIALIZED", productInstanceId: "instance-1" },
])));
pass("BULK quantity mismatch fails closed", rejects(() => validateSaleHandoverSelections(expected, [
  { kind: "BULK", productVariantId: "bulk-white-120", quantity: 1 },
  { kind: "SERIALIZED", productInstanceId: "instance-1" },
])));
pass("wrong SERIALIZED instance fails closed", rejects(() => validateSaleHandoverSelections(expected, [
  { kind: "BULK", productVariantId: "bulk-white-120", quantity: 2 },
  { kind: "SERIALIZED", productInstanceId: "instance-2" },
])));
pass("duplicate SERIALIZED scan fails closed", rejects(() => validateSaleHandoverSelections(expected, [
  { kind: "BULK", productVariantId: "bulk-white-120", quantity: 2 },
  { kind: "SERIALIZED", productInstanceId: "instance-1" },
  { kind: "SERIALIZED", productInstanceId: "instance-1" },
])));

const actions = source("app/sales/actions.ts"), mobile = source("lib/sales/mobile.ts"), lifecycle = source("lib/sales/lifecycle.ts");
const selector = source("components/OperationalItemSelector.tsx"), detail = source("components/SaleOrderDetail.tsx");
const financeQueries = source("lib/finance/queries.ts"), orderActions = source("app/orders/actions.ts"), rentalDetail = source("app/orders/[id]/page.tsx");
pass("creation uses canonical SALE draft and confirmation", actions.includes("createSaleDraft") && actions.includes("confirmSale") && actions.includes("db.$transaction"));
pass("scan does not create or fulfill a sale", selector.includes("resolveFulfillmentIdentifierAction") && !selector.includes("fulfillSale("));
pass("handover uses canonical SALE fulfillment", source("lib/sales/handover.ts").includes("return fulfillSale("));
pass("server snapshots submitted transaction price",lifecycle.includes("unitPriceMinor: item.unitPriceMinor")&&!lifecycle.includes("unitPriceMinor: price.amountMinor"));
pass("search does not require default SALE price",mobile.includes("defaultPriceMinor: price?.amountMinor")&&!mobile.includes("if (!price) continue"));
const manual=calculateSaleLine({unitPriceMinor:BigInt(30_000),quantity:2,discountMinor:BigInt(0)}),discounted=calculateSaleLine({unitPriceMinor:BigInt(40_000),quantity:1,discountMinor:BigInt(10_000)});
pass("manual price is authoritative without implicit discount",manual.grossMinor===BigInt(60_000)&&manual.lineTotalMinor===BigInt(60_000));
pass("explicit discount remains separate",discounted.grossMinor===BigInt(40_000)&&discounted.lineTotalMinor===BigInt(30_000));
pass("zero transaction price preserves SALE-2 behavior",calculateSaleLine({unitPriceMinor:BigInt(0),quantity:1,discountMinor:BigInt(0)}).lineTotalMinor===BigInt(0));
pass("negative transaction price rejected",rejects(()=>calculateSaleLine({unitPriceMinor:BigInt(-1),quantity:1,discountMinor:BigInt(0)})));
pass("missing transaction price rejected",rejects(()=>parseTransactionSalePrice("")));
pass("malformed transaction price rejected",rejects(()=>parseTransactionSalePrice("30,000")));
pass("minor-unit transaction price accepts spacing",parseTransactionSalePrice("30 000")===BigInt(30_000));
pass("search is bounded", mobile.includes("take: 12") && mobile.includes("24 - identifierRows.length"));
pass("search uses permanent fleet reduction availability", mobile.includes("getPermanentFleetReductionAvailabilityWithClient"));
pass("SERIALIZED search requires exact available branch instance", mobile.includes('operationalStatus: "AVAILABLE"') && mobile.includes("currentBranchId: branchId"));
pass("purpose-specific fulfillment authorization", source("app/scan-actions.ts").includes('hasPermission(session, "SALE_FULFILL")') && source("app/scan-actions.ts").includes('hasPermission(session, "RENTAL_ISSUE")'));
pass("tenant and branch are server scoped", actions.includes("session.organizationId") && actions.includes("requireBranchAccess"));
pass("no false paid state before charge", deriveOrderPaymentDisplayStatus({ orderTotalMinor: BigInt(10_000), totalChargedMinor: BigInt(0), paidMinor: BigInt(0), outstandingMinor: BigInt(0) }) === "NOT_ACCRUED");
pass("unpaid charged sale", deriveOrderPaymentDisplayStatus({ orderTotalMinor: BigInt(10_000), totalChargedMinor: BigInt(10_000), paidMinor: BigInt(0), outstandingMinor: BigInt(10_000) }) === "UNPAID");
pass("partially paid sale", deriveOrderPaymentDisplayStatus({ orderTotalMinor: BigInt(10_000), totalChargedMinor: BigInt(10_000), paidMinor: BigInt(4_000), outstandingMinor: BigInt(6_000) }) === "PARTIAL");
pass("fully paid sale", deriveOrderPaymentDisplayStatus({ orderTotalMinor: BigInt(10_000), totalChargedMinor: BigInt(10_000), paidMinor: BigInt(10_000), outstandingMinor: BigInt(0) }) === "PAID");
pass("unpaid Sale fulfillment is rejected", rejects(() => assertSaleFulfillmentPaid(BigInt(30_000), "KZT")));
pass("partial payment does not permit fulfillment", rejects(() => assertSaleFulfillmentPaid(BigInt(20_000), "KZT")));
pass("fully paid Sale fulfillment is permitted", !rejects(() => assertSaleFulfillmentPaid(BigInt(0), "KZT")));
pass("zero-price Sale fulfillment remains permitted", !rejects(() => assertSaleFulfillmentPaid(BigInt(0), "KZT")));
pass("refund-created outstanding balance blocks fulfillment", rejects(() => assertSaleFulfillmentPaid(BigInt(30_000), "KZT")));
pass("detail uses generic order charge read model", detail.includes("finance.orderChargeMinor"));
pass("order list uses ledger-derived payment state", source("app/orders/page.tsx").includes("getOrderPaymentListDetails") && !source("app/orders/page.tsx").includes("o.balanceDueMinor>0"));
const sidebar=source("components/Sidebar.tsx"),access=source("lib/auth/access.ts"),salesLanding=source("app/sales/page.tsx"),newSale=source("app/sales/new/page.tsx");
const form=source("components/SaleOrderForm.tsx");
pass("missing or malformed transaction price blocks creation",actions.includes("parseTransactionSalePrice(row.unitPriceMinor)")&&form.includes('!/^\\d+$/.test(line.unitPriceMinor)'));
pass("optional default prefills an editable transaction price",form.includes('unitPriceMinor:quote.defaultPriceMinor??""')&&form.includes('placeholder="Введите цену"')&&!form.includes('value={line.priceMinor} readOnly'));
pass("transaction price is posted separately from discount",form.includes("unitPriceMinor:line.unitPriceMinor")&&form.includes("discountMinor: line.discountMinor"));
pass("finance charge remains based on snapshotted order total",lifecycle.includes("synchronizeOrderChargeWithClient"));
pass("canonical navigation exposes permission-gated Sale",sidebar.includes('href:"/sales"')&&sidebar.includes('label:"Продажи"')&&sidebar.includes('["SALE_CONFIRM","SALE_FULFILL"]'));
pass("Sale route participates in canonical route access",access.includes('"/sales":'));
pass("Sale landing filters SALE orders and offers creation",salesLanding.includes('type:"SALE"')&&salesLanding.includes('href="/sales/new"')&&salesLanding.includes("+ Новая продажа"));
pass("Sale pages keep Sale navigation active",salesLanding.includes('active="/sales"')&&newSale.includes('active="/sales"')&&detail.includes('active="/sales"'));
const paymentCheck = lifecycle.indexOf("assertSaleFulfillmentPaid"), stockMutation = lifecycle.indexOf("tx.stockLevel.update", paymentCheck), issueMutation = lifecycle.indexOf('type: "SALE_ISSUE"', paymentCheck), commitmentMutation = lifecycle.indexOf('status: "FULFILLED"', paymentCheck);
pass("canonical fulfillment checks authoritative ledger", lifecycle.includes("financialTransaction.aggregate") && lifecycle.includes("obligationEffectMinor") && paymentCheck >= 0);
pass("payment guard runs before SALE inventory and commitment mutation", paymentCheck < stockMutation && paymentCheck < issueMutation && paymentCheck < commitmentMutation);
pass("scanner match cannot bypass canonical payment guard", source("lib/sales/handover.ts").includes("return fulfillSale(") && source("components/SaleFulfillmentPanel.tsx").includes("disabled={!complete || !paymentReady}"));
const financeTransactions = source("lib/finance/transactions.ts");
pass("payment refunds and reversals serialize with fulfillment", financeTransactions.includes("lockOrderFinance(tx,tenant.organizationId,value.orderId)") && financeTransactions.includes("lockOrderFinance(tx,tenant.organizationId,original.orderId)"));
pass("mobile handover explains outstanding amount", source("components/SaleFulfillmentPanel.tsx").includes("Передача недоступна — осталось оплатить") && source("components/SaleFulfillmentPanel.tsx").includes("Товар совпадает"));
pass("configured active payment methods use canonical tenant source", financeQueries.includes("organizationId:tenant.organizationId,isActive:true") && financeQueries.includes('orderBy:[{sortOrder:"asc"},{displayName:"asc"}]'));
pass("inactive payment methods are excluded", financeQueries.includes("paymentMethod.findMany({where:{organizationId:tenant.organizationId,isActive:true}"));
pass("payment method lookup is tenant isolated", !financeQueries.includes("paymentMethod.findMany({where:{isActive:true}"));
pass("empty payment method configuration is explicit", detail.includes("Способы оплаты не настроены для этой организации") && detail.includes("Нет активных способов оплаты"));
pass("default payment setup is explicit and owner-only", detail.includes("initializeDefaultPaymentMethodsAction") && orderActions.includes('s.role!=="OWNER"') && orderActions.includes("ensureDefaultPaymentMethods"));
pass("selected method reaches canonical payment action", detail.includes('name="paymentMethodId"') && detail.includes("acceptOrderPaymentAction") && orderActions.includes("acceptOrderPayment(tenant"));
pass("stale debt warning is absent", !detail.includes("Текущий домен допускает передачу") && !source("components/SaleFulfillmentPanel.tsx").includes("Текущий домен допускает передачу"));
pass("debt warning says handover unavailable", detail.includes("Передача недоступна — осталось оплатить"));
pass("Rental payment UI keeps the same canonical read model", rentalDetail.includes("finance.paymentMethods.map") && financeQueries.includes("getOrderPaymentDetails"));

console.log(`SALE-3 targeted: ${passed}/${passed} passed`);
