import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BarcodeInput } from "@/components/BarcodeInput";
import { requireRouteAccess } from "@/lib/auth/session";
import { canPerformFulfillmentAction, canPerformOrderAction } from "@/lib/auth/access";
import { createTenantContext } from "@/lib/tenant/context";
import { getOrder, getOrderFormOptions } from "@/lib/orders/queries";
import { addItemAction, assignBarcodeAction, cancelOrderAction, confirmOrderAction, issueOrderAction, markReadyAction, removeItemAction, reserveOrderAction, unassignInstanceAction, updateItemAction } from "../actions";

const money = (value: bigint, currency: string) => `${value.toLocaleString("ru-KZ")} ${currency}`;

export default async function OrderCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRouteAccess("/orders");
  const { id } = await params;
  const messages = await searchParams;
  const tenant = createTenantContext(session.organizationId);
  const [order, options] = await Promise.all([getOrder(tenant, id), getOrderFormOptions(tenant)]);
  if (!order) notFound();
  const issued = order.capacityAllocations.some((allocation) => allocation.issuedAt);
  const edit = !issued && canPerformOrderAction(session.role, "EDIT_ORDERS") && ["DRAFT", "RESERVED", "CONFIRMED"].includes(order.status);
  const canAssign = canPerformFulfillmentAction(session.role, "ASSIGN_INSTANCES") && ["RESERVED", "CONFIRMED"].includes(order.status) && !issued;
  const serialized = order.items.filter((item) => item.productVariant.product.trackingMode === "SERIALIZED");
  const fullyAssigned = serialized.every((item) => item.capacityAllocations.filter((allocation) => allocation.productInstanceId).length === item.quantity);

  return <AppShell active="/orders" title={order.orderNumber} subtitle={`${order.status} · ${order.channel}`} action={edit ? <Link href={`/orders/${id}/edit`} className="secondary button-link">Редактировать</Link> : undefined}>
    {messages.ok && <p className="notice ok">{messages.ok}</p>}
    {messages.error && <p className="notice error">{messages.error}</p>}
    <section className="order-summary card">
      <div><small>Клиент</small><Link href={`/customers/${order.customerId}`}>{[order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ")}</Link><span>{order.customer.contacts.find((contact) => contact.type === "PHONE")?.value}</span></div>
      <div><small>Период</small><b>{order.rentalStartAt?.toLocaleString("ru-KZ")} — {order.rentalEndAt?.toLocaleString("ru-KZ")}</b></div>
      <div><small>Филиал</small><b>{order.branch.name}</b></div><div><small>Источник</small><b>{order.channel}</b></div>
    </section>
    <section className="card"><h2>Позиции</h2><div className="order-items">{order.items.map((item) => <form action={updateItemAction} className="order-item" key={item.id}>
      <input type="hidden" name="orderId" value={id}/><input type="hidden" name="orderItemId" value={item.id}/><input type="hidden" name="productVariantId" value={item.productVariantId}/>
      <div><b>{item.productNameSnapshot}</b><small>{item.variantNameSnapshot} · {item.skuSnapshot} · {item.productVariant.product.trackingMode}</small></div>
      <label>Кол-во<input name="quantity" type="number" min="1" defaultValue={item.quantity} readOnly={!edit}/></label><label>Цена<input name="unitPriceMinor" defaultValue={item.unitPriceMinor.toString()} readOnly={!edit}/></label><label>Скидка<input name="itemDiscountMinor" defaultValue={item.discountTotalMinor.toString()} readOnly={!edit}/></label><input name="adjustmentReason" defaultValue={item.adjustmentReason ?? ""} placeholder="Причина" readOnly={!edit}/><strong>{money(item.lineTotalMinor, item.currency)}</strong>{edit && <><button className="secondary">Сохранить</button><button className="danger" formAction={removeItemAction}>Удалить</button></>}
    </form>)}</div>{edit && <form action={addItemAction} className="inline-form"><input type="hidden" name="orderId" value={id}/><select name="productVariantId" required><option value="">Добавить товар / размер</option>{options.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.product.name} · {variant.size.name || variant.size.code}</option>)}</select><input name="quantity" type="number" min="1" defaultValue="1"/><input name="unitPriceMinor" placeholder="Цена (пусто — текущая)"/><input name="itemDiscountMinor" defaultValue="0"/><input name="adjustmentReason" placeholder="Причина корректировки"/><button className="primary">Добавить</button></form>}</section>
    <section className="card fulfillment"><div className="section-heading"><div><h2>Подготовка заказа</h2><p>Назначение конкретных экземпляров и фактическая выдача.</p></div><span className={`status ${issued ? "confirmed" : order.readyAt ? "reserved" : "draft"}`}>{issued ? "Выдан" : order.readyAt ? "Готов к выдаче" : fullyAssigned ? "Назначено полностью" : "Требуется комплектация"}</span></div>
      {serialized.map((item) => { const assigned = item.capacityAllocations.filter((allocation) => allocation.productInstance); return <article className="fulfillment-item" key={item.id}><div><b>{item.productNameSnapshot} · {item.variantNameSnapshot}</b><span>Нужно: {item.quantity} · Назначено: {assigned.length}/{item.quantity}</span></div><div className="assigned-list">{assigned.map((allocation) => <div key={allocation.id}><span><b>{allocation.productInstance!.inventoryNumber}</b><small>{allocation.productInstance!.barcode} · {allocation.productInstance!.operationalStatus}</small></span>{canAssign && !allocation.issuedAt && <form action={unassignInstanceAction}><input type="hidden" name="orderId" value={id}/><input type="hidden" name="allocationId" value={allocation.id}/><button className="secondary">Снять назначение</button></form>}</div>)}</div>{canAssign && assigned.length < item.quantity && <BarcodeInput orderId={id} orderItemId={item.id} action={assignBarcodeAction}/>}</article>; })}
      {serialized.length === 0 && <p>В заказе только товары с количественным учётом — штрихкоды отдельных единиц не требуются.</p>}
      <div className="order-actions">{order.status === "CONFIRMED" && fullyAssigned && !order.readyAt && canPerformFulfillmentAction(session.role, "MARK_READY") && <form action={markReadyAction}><input type="hidden" name="orderId" value={id}/><button className="primary">Заказ готов</button></form>}{order.status === "CONFIRMED" && order.readyAt && !issued && canPerformFulfillmentAction(session.role, "ISSUE_ITEMS") && <form action={issueOrderAction}><input type="hidden" name="orderId" value={id}/><button className="primary">Выдать клиенту</button></form>}</div>
    </section>
    <section className="totals card"><span>Подытог <b>{money(order.subtotalMinor, order.currency)}</b></span><span>Скидка заказа <b>{money(order.discountTotalMinor, order.currency)}</b></span><span>Итого <strong>{money(order.totalMinor, order.currency)}</strong></span>{order.internalComment && <p>{order.internalComment}</p>}</section>
    <section className="order-actions card">{order.status === "DRAFT" && canPerformOrderAction(session.role, "RESERVE_ORDERS") && <form action={reserveOrderAction}><input type="hidden" name="orderId" value={id}/><button className="primary">Зарезервировать</button></form>}{order.status === "RESERVED" && canPerformOrderAction(session.role, "CONFIRM_ORDERS") && <form action={confirmOrderAction}><input type="hidden" name="orderId" value={id}/><button className="primary">Подтвердить бронь</button></form>}{!issued && ["DRAFT", "RESERVED", "CONFIRMED"].includes(order.status) && canPerformOrderAction(session.role, "CANCEL_ORDERS") && <form action={cancelOrderAction}><input type="hidden" name="orderId" value={id}/><input name="cancellationReason" minLength={3} placeholder="Причина отмены" required/><button className="danger">Отменить заказ</button></form>}</section>
    <section className="card timeline"><h2>История</h2>{order.events.map((event) => <article key={event.id}><b>{event.eventType}</b><span>{event.createdBy?.displayName ?? "Система"} · {event.createdAt.toLocaleString("ru-KZ")}</span>{event.fromStatus && <small>{event.fromStatus} → {event.toStatus}</small>}</article>)}</section>
  </AppShell>;
}
