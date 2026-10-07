import { discountPreview } from "@/lib/orders/discount-display";
export function DiscountBreakdown({ gross, itemDiscount, orderDiscount, currency }: { gross: string; itemDiscount: string; orderDiscount: string; currency: string }) {
  const value = discountPreview(gross, itemDiscount, orderDiscount), money = (n: bigint) => `${n.toLocaleString("ru-KZ")} ${currency}`;
  return <div className="discount-breakdown" aria-live="polite">{!value ? <p role="alert">Введите целую неотрицательную сумму скидки.</p> : <><p>До скидок: <b>{money(value.before)}</b></p><p>Скидки позиций: <b>{money(value.items)}</b></p><p>Скидка заказа: <b>{money(value.order)}</b></p>{value.valid ? <p>После скидок: <strong>{money(value.after)}</strong></p> : <p role="alert">Скидки превышают стоимость. Сохранение невозможно.</p>}</>}<small>Фиксированная сумма в валюте заказа, не процент. Итог проверяется сервером при сохранении.</small></div>;
}
