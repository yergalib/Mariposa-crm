"use client";

import Link from "next/link";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
import { useMemo, useState } from "react";
import { assignBarcodeAction, issueVerifiedRentalAction, markReadyAction } from "@/app/orders/actions";
import { OperationalItemSelector } from "@/components/OperationalItemSelector";
import type { OperationalIdentifierResult } from "@/lib/inventory/operational-contract";

type Allocation = { id: string; quantity: number; issuedQuantity: number; productInstanceId: string | null; inventoryNumber: string | null; barcode: string | null };
export type RentalOperationalItem = { id: string; productId: string; executionId: string | null; sizeId: string; productVariantId: string; trackingMode: "BULK" | "SERIALIZED"; productName: string; variantName: string; sku: string; quantity: number; allocations: Allocation[] };

const money = (value: bigint, currency: string) => `${value.toLocaleString("ru-KZ")} ${currency === "KZT" ? "₸" : currency}`;
const identity = (item: RentalOperationalItem) => `${item.productName} · ${item.variantName}`;
const scannedIdentity = (result: Extract<OperationalIdentifierResult, { kind: "BULK_VARIANT" | "SERIALIZED_INSTANCE" }>) => `${result.product.name} · ${result.execution?.name ?? "без исполнения"} · ${result.variant.size.name || result.variant.size.code}`;
function mismatchMessage(items: RentalOperationalItem[], result: Extract<OperationalIdentifierResult, { kind: "BULK_VARIANT" | "SERIALIZED_INSTANCE" }>) {
  const sameProduct = items.filter((item) => item.productId === result.product.id);
  if (!sameProduct.length) return `Этот товар не входит в заказ. Отсканировано: ${scannedIdentity(result)}.`;
  const sameExecution = sameProduct.filter((item) => item.executionId === (result.execution?.id ?? null));
  if (!sameExecution.length) return `Исполнение не совпадает. Ожидалось: ${identity(sameProduct[0])}. Отсканировано: ${scannedIdentity(result)}.`;
  return `Размер не совпадает. Ожидалось: ${sameExecution.map(identity).join("; ")}. Отсканировано: ${scannedIdentity(result)}.`;
}

export function RentalOperationalPanel({ orderId, branchId, timeZone, status, readyAt, expectedReturnAt, items, returnedQuantity, physicalOutstanding, returnConditions, canAssign, canPrepare, canIssue, outstandingMinor, currency }: {
  orderId: string; branchId: string; timeZone: string; status: string; readyAt: string | null; expectedReturnAt: string | null; items: RentalOperationalItem[];
  returnedQuantity: number; physicalOutstanding: number; returnConditions: string[];
  canAssign: boolean; canPrepare: boolean; canIssue: boolean; outstandingMinor: string | null; currency: string;
}) {
  const [assignment, setAssignment] = useState<{ orderItemId: string; barcode: string; label: string } | null>(null);
  const [bulkMatches, setBulkMatches] = useState<string[]>([]);
  const [instanceMatches, setInstanceMatches] = useState<string[]>([]);
  const [message, setMessage] = useState("Сканируйте товар, чтобы проверить его перед выдачей.");
  const issued = items.some((item) => item.allocations.some((allocation) => allocation.issuedQuantity > 0));
  const fullyAssigned = items.filter((item) => item.trackingMode === "SERIALIZED").every((item) => item.allocations.filter((allocation) => allocation.productInstanceId).length === item.quantity);
  const outstanding = outstandingMinor === null ? null : BigInt(outstandingMinor);
  const paid = outstanding === BigInt(0);
  const expected = useMemo(() => {
    const bulk = new Map<string, { item: RentalOperationalItem; quantity: number }>();
    const serialized: Array<{ item: RentalOperationalItem; allocation: Allocation }> = [];
    for (const item of items) for (const allocation of item.allocations) {
      const quantity = allocation.quantity - allocation.issuedQuantity;
      if (quantity <= 0) continue;
      if (allocation.productInstanceId) serialized.push({ item, allocation });
      else {
        const current = bulk.get(item.productVariantId);
        bulk.set(item.productVariantId, { item, quantity: (current?.quantity ?? 0) + quantity });
      }
    }
    return { bulk: [...bulk.values()], serialized };
  }, [items]);
  const selections = [
    ...expected.bulk.filter(({ item }) => bulkMatches.includes(item.productVariantId)).map(({ item, quantity }) => ({ kind: "BULK" as const, productVariantId: item.productVariantId, quantity })),
    ...expected.serialized.filter(({ allocation }) => instanceMatches.includes(allocation.productInstanceId!)).map(({ allocation }) => ({ kind: "SERIALIZED" as const, productInstanceId: allocation.productInstanceId! })),
  ];
  const allMatched = selections.length === expected.bulk.length + expected.serialized.length && selections.length > 0;

  const onPrepareSelect = (result: Extract<OperationalIdentifierResult, { kind: "BULK_VARIANT" | "SERIALIZED_INSTANCE" }>) => {
    if (result.kind !== "SERIALIZED_INSTANCE") { setAssignment(null); setMessage("Для BULK подготовка выполняется по количеству. Экземпляр назначать не нужно."); return; }
    const item = items.find((row) => row.trackingMode === "SERIALIZED" && row.productVariantId === result.variant.id && row.allocations.filter((allocation) => allocation.productInstanceId).length < row.quantity);
    if (!item) { setAssignment(null); setMessage(mismatchMessage(items, result)); return; }
    setAssignment({ orderItemId: item.id, barcode: result.instance.barcode, label: `${identity(item)} · ${result.instance.inventoryNumber}` });
    setMessage("Экземпляр совпадает. Подтвердите назначение для подготовки.");
  };
  const onIssueSelect = (result: Extract<OperationalIdentifierResult, { kind: "BULK_VARIANT" | "SERIALIZED_INSTANCE" }>) => {
    if (result.kind === "BULK_VARIANT") {
      const row = expected.bulk.find(({ item }) => item.productVariantId === result.variant.id);
      if (!row) { setMessage(mismatchMessage(items, result)); return; }
      setBulkMatches((current) => current.includes(result.variant.id) ? current : [...current, result.variant.id]);
      setMessage(`Товар совпадает: ${identity(row.item)} · к выдаче ${row.quantity} шт.`);
      return;
    }
    const row = expected.serialized.find(({ allocation }) => allocation.productInstanceId === result.instance.id);
    if (!row) { const variantExpected=items.some((item)=>item.productVariantId===result.variant.id); setMessage(variantExpected?`Этот экземпляр не назначен этому заказу: ${result.instance.inventoryNumber}.`:mismatchMessage(items,result)); return; }
    setInstanceMatches((current) => current.includes(result.instance.id) ? current : [...current, result.instance.id]);
    setMessage(`Экземпляр совпадает: ${identity(row.item)} · ${result.instance.inventoryNumber}.`);
  };

  if (issued) {
    const issuedQuantity = items.reduce((sum, item) => sum + item.allocations.reduce((inner, allocation) => inner + allocation.issuedQuantity, 0), 0);
    const allReturned = physicalOutstanding === 0;
    return <section className="ui-card rental-mobile-operations issued"><div className="section-heading"><div><h2>{allReturned ? "Товар возвращён" : "Товар выдан"}</h2><p>{allReturned ? `${returnedQuantity} шт. принято` : `${physicalOutstanding} шт. ожидается к возврату`}</p></div><span className="status confirmed">{allReturned ? "Возвращён" : "Выдан"}</span></div>{returnedQuantity > 0 && <p>Состояние: <b>{returnConditions.length ? returnConditions.join(", ") : "указано при приёмке"}</b></p>}{!allReturned && <><p>Ожидаемый возврат: <b>{expectedReturnAt ? formatBusinessDateTime(new Date(expectedReturnAt),timeZone) : "не указан"}</b></p><Link href={`/returns/${orderId}`} className="ui-button primary">Принять возврат</Link></>}</section>;
  }
  if (status !== "CONFIRMED") return null;
  if (!readyAt) return <section className="ui-card rental-mobile-operations"><div className="section-heading"><div><h2>Подготовка заказа</h2><p>{fullyAssigned ? "Все позиции готовы к подтверждению комплектации." : "Назначьте точные SERIALIZED экземпляры. BULK готовится по количеству."}</p></div><span className="status reserved">Подготовка</span></div>
    {!fullyAssigned && canAssign && <><OperationalItemSelector purpose="FULFILLMENT_ISSUE" branchId={branchId} triggerLabel="Сканировать экземпляр" prompt="Сканируйте экземпляр для этого заказа" onSelect={onPrepareSelect} onProductSelectionRequired={(result) => setMessage(`Выберите конкретный экземпляр товара ${result.product.name}.`)}/><p className={assignment ? "notice ok" : message.startsWith("Этот") ? "notice error" : "notice"}>{message}</p>{assignment && <form action={assignBarcodeAction} className="rental-operation-action"><input type="hidden" name="orderId" value={orderId}/><input type="hidden" name="orderItemId" value={assignment.orderItemId}/><input type="hidden" name="barcode" value={assignment.barcode}/><b>{assignment.label}</b><button className="primary">Назначить экземпляр</button></form>}</>}
    {fullyAssigned && canPrepare && <form action={markReadyAction}><input type="hidden" name="orderId" value={orderId}/><button className="primary">Подготовить заказ</button></form>}
  </section>;
  if (!canIssue) return <section className="ui-card rental-mobile-operations"><h2>Заказ готов</h2><p>Для выдачи требуется разрешение сотрудника.</p></section>;
  return <section className="ui-card rental-mobile-operations rental-issue"><div className="section-heading"><div><h2>Проверить и выдать</h2><p>Сканирование только подтверждает соответствие. Выдача выполняется отдельной кнопкой.</p></div><span className={`status ${allMatched ? "confirmed" : "reserved"}`}>{selections.length} / {expected.bulk.length + expected.serialized.length}</span></div>
    <OperationalItemSelector purpose="FULFILLMENT_ISSUE" branchId={branchId} triggerLabel="Сканировать для выдачи" prompt="Сканируйте товар этого заказа" onSelect={onIssueSelect} onProductSelectionRequired={(result) => setMessage(`Код ${result.product.code} обозначает товар целиком. Сканируйте конкретный SKU или экземпляр.`)}/>
    <p className={message.startsWith("Этот") ? "notice error" : allMatched ? "notice ok" : "notice"} role="status">{message}</p>
    {allMatched && <p className="notice ok">Товар совпадает</p>}
    {!paid && <><p className="notice error" role="alert">{outstanding !== null && outstanding > BigInt(0) ? `Выдача недоступна — осталось оплатить ${money(outstanding, currency)}.` : "Выдача недоступна — финансовый расчёт заказа не закрыт."}</p><a className="ui-button secondary" href="#rental-payment">Перейти к оплате</a></>}
    <div className="rental-match-list">{expected.bulk.map(({ item, quantity }) => <article className={bulkMatches.includes(item.productVariantId) ? "matched" : ""} key={item.productVariantId}><span><b>{identity(item)}</b><small>Количество к выдаче: {quantity} · SKU {item.sku}</small></span><strong>{bulkMatches.includes(item.productVariantId) ? "✓ Совпадает" : "Ожидается"}</strong></article>)}{expected.serialized.map(({ item, allocation }) => <article className={instanceMatches.includes(allocation.productInstanceId!) ? "matched" : ""} key={allocation.id}><span><b>{identity(item)}</b><small>{allocation.inventoryNumber} · {allocation.barcode}</small></span><strong>{instanceMatches.includes(allocation.productInstanceId!) ? "✓ Совпадает" : "Ожидается"}</strong></article>)}</div>
    <form action={issueVerifiedRentalAction}><input type="hidden" name="orderId" value={orderId}/><input type="hidden" name="selectionsJson" value={JSON.stringify(selections)}/><button className="primary" disabled={!allMatched || !paid}>Подтвердить выдачу</button></form>
  </section>;
}
