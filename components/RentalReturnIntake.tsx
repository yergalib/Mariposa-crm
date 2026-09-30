"use client";

import { useMemo, useState } from "react";
import { OperationalItemSelector } from "@/components/OperationalItemSelector";
import { receiveReturnForOrderAction, returnBulkIntakeAction } from "@/app/orders/actions";
import type { OperationalIdentifierResult } from "@/lib/inventory/operational-contract";

type Location = { id: string; name: string; type: string };
type Item = { orderItemId: string; allocationId: string; productVariantId: string; productName: string; executionName: string | null; sizeName: string; sku: string; trackingMode: "BULK" | "SERIALIZED"; orderedQuantity: number; issuedQuantity: number; returnedQuantity: number; outstandingQuantity: number; instance: { id: string; inventoryNumber: string; barcode: string; operationalStatus: string } | null };

const identity = (item: Item) => `${item.executionName ? `${item.executionName} · ` : ""}${item.sizeName}`;
export function RentalReturnIntake({ order, items, locations, initialAllocationId, initialBarcode, operationKey }: { order: { id: string; orderNumber: string; branchId: string; customerName: string; customerNumber: string }; items: Item[]; locations: Location[]; initialAllocationId?: string; initialBarcode?: string; operationKey: string }) {
  const initial = items.find(item => item.allocationId === initialAllocationId) ?? items[0] ?? null;
  const [selectedId, setSelectedId] = useState(initial?.allocationId ?? ""), [outcome, setOutcome] = useState<"GOOD" | "NEEDS_CLEANING" | "DAMAGED">("GOOD"), [verifiedBarcode, setVerifiedBarcode] = useState(() => initial?.trackingMode === "SERIALIZED" && initialBarcode && initial.instance?.barcode.toUpperCase() === initialBarcode.trim().toUpperCase() ? initial.instance.barcode : ""), [message, setMessage] = useState("");
  const selected = items.find(item => item.allocationId === selectedId) ?? null;
  const compatibleLocations = useMemo(() => locations.filter(location => outcome === "NEEDS_CLEANING" ? location.type === "CLEANING" : outcome === "DAMAGED" ? location.type === "REPAIR" : !["CLEANING", "REPAIR", "TRANSIT"].includes(location.type)), [locations, outcome]);
  const select = (id: string) => { setSelectedId(id); setVerifiedBarcode(""); setMessage(""); };
  const verify = (result: Extract<OperationalIdentifierResult, { kind: "BULK_VARIANT" | "SERIALIZED_INSTANCE" }>) => {
    if (!selected || selected.trackingMode !== "SERIALIZED" || result.kind !== "SERIALIZED_INSTANCE" || result.instance.id !== selected.instance?.id) { setVerifiedBarcode(""); setMessage("Отсканирован другой экземпляр. Возврат не подтверждён."); return; }
    setVerifiedBarcode(result.instance.barcode); setMessage(`Экземпляр совпадает: ${result.instance.inventoryNumber}.`);
  };
  if (!items.length) return <section className="card return-intake-empty"><h2>Все выданные позиции уже обработаны</h2><p>Невозвращённых товаров по этому заказу нет.</p></section>;
  return <div className="return-intake">
    {items.length > 1 && <section className="return-intake-items" aria-label="Позиции к возврату">{items.map(item => <button type="button" className={item.allocationId === selectedId ? "selected" : ""} key={item.allocationId} onClick={() => select(item.allocationId)}><strong>{item.productName}</strong><span>{identity(item)}</span><small>К возврату: {item.outstandingQuantity}</small></button>)}</section>}
    {selected && <section className="card return-intake-card"><header><div><small>{order.orderNumber} · {order.customerName}</small><h2>{selected.productName}</h2><p>{identity(selected)}</p></div><strong>К возврату: {selected.outstandingQuantity} шт.</strong></header>
      {selected.trackingMode === "SERIALIZED" && <div className="serialized-return-verification"><p>Для SERIALIZED возврата отсканируйте точный выданный экземпляр: <b>{selected.instance?.inventoryNumber}</b>.</p><OperationalItemSelector purpose="RETURN_RECEIVE" triggerLabel="Проверить экземпляр" prompt="Сканируйте штрихкод выданного экземпляра" onSelect={verify}/>{message && <p className={verifiedBarcode ? "notice ok" : "notice error"}>{message}</p>}</div>}
      <form action={selected.trackingMode === "BULK" ? returnBulkIntakeAction : receiveReturnForOrderAction} className="return-intake-form">
        <input type="hidden" name="orderId" value={order.id}/><input type="hidden" name="allocationId" value={selected.allocationId}/><input type="hidden" name="barcode" value={verifiedBarcode}/><input type="hidden" name="idempotencyKey" value={`return-intake:${operationKey}:${selected.allocationId}`}/>
        {selected.trackingMode === "BULK" && <label>Количество<input name="quantity" type="number" inputMode="numeric" min="1" max={selected.outstandingQuantity} defaultValue={selected.outstandingQuantity} required/></label>}
        <label>Состояние<select name="inspectionResult" value={outcome} onChange={event => setOutcome(event.target.value as typeof outcome)}><option value="GOOD">Хорошее состояние</option><option value="NEEDS_CLEANING">Требуется чистка</option><option value="DAMAGED">Повреждено</option></select></label>
        {selected.trackingMode === "BULK" && <label>Куда принять<select name="locationId" key={outcome} defaultValue={compatibleLocations[0]?.id ?? ""} required><option value="" disabled>Выберите локацию</option>{compatibleLocations.map(location => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label>}
        <label>Комментарий<textarea name="conditionNote" maxLength={1000} placeholder="При необходимости"/></label>
        <button className="primary" disabled={selected.trackingMode === "SERIALIZED" && !verifiedBarcode}>Принять возврат</button>
      </form>
    </section>}
  </div>;
}
