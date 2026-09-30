import { FulfillmentError } from "@/lib/fulfillment/errors";

export function assertRentalIssuePaid(outstandingMinor: bigint, currency: string) {
  if (outstandingMinor === BigInt(0)) return;
  if (outstandingMinor > BigInt(0)) {
    const amount = `${outstandingMinor.toLocaleString("ru-KZ")} ${currency === "KZT" ? "₸" : currency}`;
    throw new FulfillmentError("INVALID_STATE", `Выдача недоступна — осталось оплатить ${amount}.`);
  }
  throw new FulfillmentError("INVALID_STATE", "Выдача недоступна: финансовый расчёт заказа не закрыт.");
}
