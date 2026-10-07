"use client";
import { useState } from "react";
import { RetainedActionForm } from "./RetainedActionForm";
import { DiscountBreakdown } from "./DiscountBreakdown";
import { updateItemRetainedAction, removeItemAction } from "@/app/orders/actions";
type Item = { id: string; productVariantId: string; name: string; detail: string; quantity: number; price: string; discount: string; reason: string; currency: string };
export function OrderItemAdjustmentForm({ orderId, item, edit, priceAccess, discountAccess }: { orderId: string; item: Item; edit: boolean; priceAccess: boolean; discountAccess: boolean }) {
  const [price, setPrice] = useState(item.price), [quantity, setQuantity] = useState(String(item.quantity)), [discount, setDiscount] = useState(item.discount);
  const gross = /^\d{1,20}$/.test(price) && /^\d{1,4}$/.test(quantity) ? (BigInt(price) * BigInt(quantity)).toString() : "";
  return <div className="order-item-adjustment"><RetainedActionForm action={updateItemRetainedAction} className="order-item">
    <input type="hidden" name="orderId" value={orderId}/><input type="hidden" name="orderItemId" value={item.id}/><input type="hidden" name="productVariantId" value={item.productVariantId}/>
    <div><b>{item.name}</b><small>{item.detail}</small></div><label>Количество<input name="quantity" type="number" min="1" max="1000" value={quantity} onChange={e => setQuantity(e.target.value)} readOnly={!edit}/></label><label>Цена за единицу<input name="unitPriceMinor" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} readOnly={!edit || !priceAccess}/></label><label>Скидка на всю позицию<input name="itemDiscountMinor" inputMode="numeric" value={discount} onChange={e => setDiscount(e.target.value)} readOnly={!edit || !discountAccess}/></label><label>Причина корректировки<input name="adjustmentReason" maxLength={500} defaultValue={item.reason} readOnly={!edit}/></label>
    <DiscountBreakdown gross={gross} itemDiscount={discount} orderDiscount="0" currency={item.currency}/>{edit && <button className="secondary">Сохранить позицию</button>}
    </RetainedActionForm>{edit && <form action={removeItemAction}><input type="hidden" name="orderId" value={orderId}/><input type="hidden" name="orderItemId" value={item.id}/><button className="danger">Удалить позицию</button></form>}</div>;
}
