import { readFileSync } from "node:fs";
import { deriveOrderPaymentDisplayStatus } from "../lib/finance/payment-status";
import { validateSaleHandoverSelections } from "../lib/sales/handover-contract";

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
pass("creation uses canonical SALE draft and confirmation", actions.includes("createSaleDraft") && actions.includes("confirmSale") && actions.includes("db.$transaction"));
pass("scan does not create or fulfill a sale", selector.includes("resolveFulfillmentIdentifierAction") && !selector.includes("fulfillSale("));
pass("handover uses canonical SALE fulfillment", source("lib/sales/handover.ts").includes("return fulfillSale("));
pass("server owns current SALE price", lifecycle.includes('type: "SALE"') && lifecycle.includes("unitPriceMinor: price.amountMinor"));
pass("search is bounded", mobile.includes("take: 12") && mobile.includes("24 - identifierRows.length"));
pass("search uses permanent fleet reduction availability", mobile.includes("getPermanentFleetReductionAvailabilityWithClient"));
pass("SERIALIZED search requires exact available branch instance", mobile.includes('operationalStatus: "AVAILABLE"') && mobile.includes("currentBranchId: branchId"));
pass("purpose-specific fulfillment authorization", source("app/scan-actions.ts").includes('requirePermission(session, "SALE_FULFILL")'));
pass("tenant and branch are server scoped", actions.includes("session.organizationId") && actions.includes("requireBranchAccess"));
pass("no false paid state before charge", deriveOrderPaymentDisplayStatus({ orderTotalMinor: BigInt(10_000), totalChargedMinor: BigInt(0), paidMinor: BigInt(0), outstandingMinor: BigInt(0) }) === "NOT_ACCRUED");
pass("unpaid charged sale", deriveOrderPaymentDisplayStatus({ orderTotalMinor: BigInt(10_000), totalChargedMinor: BigInt(10_000), paidMinor: BigInt(0), outstandingMinor: BigInt(10_000) }) === "UNPAID");
pass("partially paid sale", deriveOrderPaymentDisplayStatus({ orderTotalMinor: BigInt(10_000), totalChargedMinor: BigInt(10_000), paidMinor: BigInt(4_000), outstandingMinor: BigInt(6_000) }) === "PARTIAL");
pass("fully paid sale", deriveOrderPaymentDisplayStatus({ orderTotalMinor: BigInt(10_000), totalChargedMinor: BigInt(10_000), paidMinor: BigInt(10_000), outstandingMinor: BigInt(0) }) === "PAID");
pass("detail uses generic order charge read model", detail.includes("finance.orderChargeMinor"));
pass("order list uses ledger-derived payment state", source("app/orders/page.tsx").includes("getOrderPaymentListDetails") && !source("app/orders/page.tsx").includes("o.balanceDueMinor>0"));
const sidebar=source("components/Sidebar.tsx"),access=source("lib/auth/access.ts"),salesLanding=source("app/sales/page.tsx"),newSale=source("app/sales/new/page.tsx");
pass("canonical navigation exposes permission-gated Sale",sidebar.includes('href:"/sales"')&&sidebar.includes('label:"Продажи"')&&sidebar.includes('["SALE_CONFIRM","SALE_FULFILL"]'));
pass("Sale route participates in canonical route access",access.includes('"/sales":'));
pass("Sale landing filters SALE orders and offers creation",salesLanding.includes('type:"SALE"')&&salesLanding.includes('href="/sales/new"')&&salesLanding.includes("+ Новая продажа"));
pass("Sale pages keep Sale navigation active",salesLanding.includes('active="/sales"')&&newSale.includes('active="/sales"')&&detail.includes('active="/sales"'));

console.log(`SALE-3 targeted: ${passed}/${passed} passed`);
