export const PAYMENT_CHANNEL_LABELS = { CASH: "Наличные", NON_CASH: "Безналичные", OTHER: "Без категории" } as const;
export type PaymentChannel = keyof typeof PAYMENT_CHANNEL_LABELS;
export const NON_CASH_CODES = ["KASPI", "BANK_CARD", "BANK_TRANSFER"];
export function paymentChannel(code?: string | null): PaymentChannel {
  return code === "CASH" ? "CASH" : code && NON_CASH_CODES.includes(code) ? "NON_CASH" : "OTHER";
}
