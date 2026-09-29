import { OrderError } from "@/lib/orders/errors";

export function assertSaleFulfillmentPaid(outstandingMinor: bigint, currency: string) {
  if (outstandingMinor === BigInt(0)) return;
  if (outstandingMinor > BigInt(0)) {
    const amount = `${outstandingMinor.toLocaleString("ru-KZ")} ${currency === "KZT" ? "₸" : currency}`;
    throw new OrderError("INVALID_STATE", `Передача недоступна — осталось оплатить ${amount}.`);
  }
  throw new OrderError("INVALID_STATE", "Передача недоступна: финансовый расчёт продажи не закрыт.");
}
