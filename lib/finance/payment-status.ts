export type OrderPaymentDisplayStatus =
  | "NOT_ACCRUED"
  | "NOT_REQUIRED"
  | "UNPAID"
  | "PARTIAL"
  | "PAID"
  | "OVERPAID";

type PaymentStatusInput = {
  orderTotalMinor: bigint;
  totalChargedMinor: bigint;
  paidMinor: bigint;
  outstandingMinor: bigint;
};

export function deriveOrderPaymentDisplayStatus(input: PaymentStatusInput): OrderPaymentDisplayStatus {
  if (input.outstandingMinor < BigInt(0) || input.paidMinor > input.totalChargedMinor) return "OVERPAID";
  if (
    input.totalChargedMinor === BigInt(0)
    && input.paidMinor === BigInt(0)
    && input.outstandingMinor === BigInt(0)
  ) {
    return input.orderTotalMinor > BigInt(0) ? "NOT_ACCRUED" : "NOT_REQUIRED";
  }
  if (input.outstandingMinor > BigInt(0)) return input.paidMinor > BigInt(0) ? "PARTIAL" : "UNPAID";
  return "PAID";
}
