"use client";

import { useMemo, useState } from "react";
import { OperationalItemSelector } from "@/components/OperationalItemSelector";
import type { OperationalIdentifierResult } from "@/lib/inventory/operational-contract";
import { fulfillVerifiedSaleAction } from "@/app/sales/actions";

export type SaleCommitmentView = {
  id: string;
  productVariantId: string;
  productInstanceId: string | null;
  quantity: number;
  productName: string;
  executionName: string | null;
  sizeLabel: string;
  sku: string;
  instanceBarcode: string | null;
  inventoryNumber: string | null;
};

const identity = (row: SaleCommitmentView) => `${row.productName}${row.executionName ? ` · ${row.executionName}` : ""} · ${row.sizeLabel}`;

export function SaleFulfillmentPanel({ orderId, branchId, commitments, idempotencyKey }: { orderId: string; branchId: string; commitments: SaleCommitmentView[]; idempotencyKey: string }) {
  const [bulkMatches, setBulkMatches] = useState<string[]>([]), [instanceMatches, setInstanceMatches] = useState<string[]>([]), [message, setMessage] = useState("Сканируйте или найдите каждую позицию перед передачей.");
  const bulk = useMemo(() => {
    const grouped = new Map<string, SaleCommitmentView & { totalQuantity: number }>();
    for (const row of commitments.filter((item) => !item.productInstanceId)) {
      const current = grouped.get(row.productVariantId);
      if (current) current.totalQuantity += row.quantity;
      else grouped.set(row.productVariantId, { ...row, totalQuantity: row.quantity });
    }
    return [...grouped.values()];
  }, [commitments]);
  const serialized = commitments.filter((row) => row.productInstanceId);
  const selections = [
    ...bulk.filter((row) => bulkMatches.includes(row.productVariantId)).map((row) => ({ kind: "BULK" as const, productVariantId: row.productVariantId, quantity: row.totalQuantity })),
    ...serialized.filter((row) => instanceMatches.includes(row.productInstanceId!)).map((row) => ({ kind: "SERIALIZED" as const, productInstanceId: row.productInstanceId! })),
  ];
  const complete = selections.length === bulk.length + serialized.length;

  const onSelect = (result: Extract<OperationalIdentifierResult, { kind: "BULK_VARIANT" | "SERIALIZED_INSTANCE" }>) => {
    if (result.kind === "BULK_VARIANT") {
      const expected = bulk.find((row) => row.productVariantId === result.variant.id);
      if (!expected) { setMessage(`Не совпадает: ${result.product.name} · ${result.execution?.name ?? "без исполнения"} · ${result.variant.size.name || result.variant.size.code} не входит в эту продажу.`); return; }
      setBulkMatches((current) => current.includes(expected.productVariantId) ? current : [...current, expected.productVariantId]);
      setMessage(`Совпадение подтверждено: ${identity(expected)} · ${expected.totalQuantity} шт.`);
      return;
    }
    const expected = serialized.find((row) => row.productInstanceId === result.instance.id);
    if (!expected) { setMessage(`Не совпадает: экземпляр ${result.instance.inventoryNumber} не закреплён за этой продажей.`); return; }
    setInstanceMatches((current) => current.includes(expected.productInstanceId!) ? current : [...current, expected.productInstanceId!]);
    setMessage(`Совпадение подтверждено: ${identity(expected)} · ${expected.inventoryNumber}.`);
  };

  return <section className="ui-card sale-handover"><div className="section-heading"><div><h2>Передача товара</h2><p>Сканирование подтверждает соответствие. Остаток изменится только после отдельного подтверждения.</p></div><span className={`status ${complete ? "confirmed" : "reserved"}`}>{selections.length} / {bulk.length + serialized.length}</span></div>
    <OperationalItemSelector purpose="FULFILLMENT_ISSUE" branchId={branchId} triggerLabel="Сканировать для передачи" prompt="Сканируйте товар этой продажи" onSelect={onSelect} onProductSelectionRequired={(result) => setMessage(`Код ${result.product.code} обозначает товар целиком. Сканируйте SKU конкретного варианта.`)}/>
    <p className={message.startsWith("Не совпадает") ? "notice error" : complete ? "notice ok" : "notice"} role="status">{message}</p>
    <div className="sale-handover-list">{bulk.map((row) => <article className={bulkMatches.includes(row.productVariantId) ? "matched" : ""} key={`bulk-${row.productVariantId}`}><span><b>{identity(row)}</b><small>Количество: {row.totalQuantity} · SKU {row.sku}</small></span><strong>{bulkMatches.includes(row.productVariantId) ? "✓ Совпадает" : "Ожидается"}</strong></article>)}{serialized.map((row) => <article className={instanceMatches.includes(row.productInstanceId!) ? "matched" : ""} key={row.id}><span><b>{identity(row)}</b><small>{row.inventoryNumber} · {row.instanceBarcode}</small></span><strong>{instanceMatches.includes(row.productInstanceId!) ? "✓ Совпадает" : "Ожидается"}</strong></article>)}</div>
    <form action={fulfillVerifiedSaleAction}><input type="hidden" name="orderId" value={orderId}/><input type="hidden" name="idempotencyKey" value={idempotencyKey}/><input type="hidden" name="selectionsJson" value={JSON.stringify(selections)}/><button className="primary" disabled={!complete}>Подтвердить передачу</button></form>
  </section>;
}
