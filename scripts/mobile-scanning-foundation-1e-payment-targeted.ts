import { readFileSync } from "node:fs";
import { deriveOrderPaymentDisplayStatus } from "../lib/finance/payment-status";

let passed = 0;
const ok = (name: string, value: unknown) => {
  if (!value) throw new Error(`FAIL ${name}`);
  passed += 1;
};
const state = (orderTotalMinor: number, totalChargedMinor: number, paidMinor: number, outstandingMinor: number) =>
  deriveOrderPaymentDisplayStatus({
    orderTotalMinor: BigInt(orderTotalMinor),
    totalChargedMinor: BigInt(totalChargedMinor),
    paidMinor: BigInt(paidMinor),
    outstandingMinor: BigInt(outstandingMinor),
  });

ok("draft commercial total without charge is not paid", state(10000, 0, 0, 0) === "NOT_ACCRUED");
ok("zero-value order requires no payment", state(0, 0, 0, 0) === "NOT_REQUIRED");
ok("accrued unpaid", state(10000, 10000, 0, 10000) === "UNPAID");
ok("partially paid", state(10000, 10000, 3000, 7000) === "PARTIAL");
ok("fully paid", state(10000, 10000, 10000, 0) === "PAID");
ok("full refund returns to unpaid", state(10000, 10000, 0, 10000) === "UNPAID");
ok("overpayment is explicit", state(10000, 10000, 11000, -1000) === "OVERPAID");
ok("zero outstanding alone does not imply paid", state(10000, 0, 0, 0) !== state(10000, 10000, 10000, 0));

const page = readFileSync("app/orders/[id]/page.tsx", "utf8");
ok("draft label is explicit", page.includes("Начисление ещё не создано"));
ok("draft explanation names confirmation boundary", page.includes("финансовое начисление появится только после подтверждения брони"));
ok("overpayment is rendered as positive amount", page.includes("money(-finance.outstandingMinor"));

console.log(`FOUNDATION-1E payment semantics targeted: ${passed}/${passed} passed`);
