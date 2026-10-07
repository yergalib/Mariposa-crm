"use client";
import { useState } from "react";
import { RetainedActionForm } from "@/components/RetainedActionForm";
import { warehouseOperationAction } from "@/app/warehouse/operation-action";

export type WarehouseOperation = "receipts" | "transfers" | "write-offs";
type Option = { id: string; name: string };
export type WarehouseFormOptions = {
  variants: Array<Option & { mode: string }>;
  branches: Option[];
  locations: Array<Option & { branchId: string }>;
  instances: Array<Option & { branchId: string; variantId: string }>;
};

function PlaceFields({ branches, locations, prefix = "", title }: Pick<WarehouseFormOptions, "branches" | "locations"> & { prefix?: string; title: string }) {
  const [branch, setBranch] = useState(branches[0]?.id ?? "");
  const branchName = prefix ? `${prefix}BranchId` : "branchId";
  const locationName = prefix ? `${prefix}LocationId` : "locationId";
  return <>
    <label>{title}: филиал<select required name={branchName} value={branch} onChange={event => setBranch(event.target.value)}>
      <option value="" disabled>Выберите филиал</option>{branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>
    <label>{title}: место хранения<select key={branch} required name={locationName} defaultValue="">
      <option value="" disabled>Выберите место</option>{locations.filter(row => row.branchId === branch).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>
  </>;
}

export function WarehouseOperationForm({ operation, options, idempotencyKey }: { operation: WarehouseOperation; options: WarehouseFormOptions; idempotencyKey: string }) {
  const [variantId, setVariantId] = useState(options.variants.find(row => row.mode === "BULK")?.id ?? options.variants[0]?.id ?? "");
  const [instanceId, setInstanceId] = useState("");
  const variant = options.variants.find(row => row.id === variantId);
  const serialized = variant?.mode === "SERIALIZED";
  const instance = options.instances.find(row => row.id === instanceId && row.variantId === variantId);
  const transfer = operation === "transfers", writeOff = operation === "write-offs";
  const button = writeOff ? "Списать" : transfer ? "Переместить" : "Принять на склад";
  return <RetainedActionForm action={warehouseOperationAction} className="card form-grid warehouse-operation-form">
    <input type="hidden" name="operation" value={operation}/>
    <input type="hidden" name="idempotencyKey" value={idempotencyKey}/>
    <input type="hidden" name="mode" value={variant?.mode ?? "BULK"}/>
    <label>Товар / размер<select required name="variantId" value={variantId} onChange={event => { setVariantId(event.target.value); setInstanceId(""); }}>
      <option value="" disabled>Выберите товар</option>{options.variants.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>
    <p className="muted">{serialized ? "Индивидуальный учёт экземпляров." : "Количественный учёт: один штрихкод на вариант товара."}</p>
    {serialized && (transfer || writeOff) ? <>
      <label>Доступный экземпляр<select required name="instanceId" value={instanceId} onChange={event => setInstanceId(event.target.value)}>
        <option value="" disabled>Выберите экземпляр</option>{options.instances.filter(row => row.variantId === variantId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      {transfer && <input type="hidden" name="fromBranchId" value={instance?.branchId ?? ""}/>}
    </> : <PlaceFields {...options} prefix={transfer ? "from" : ""} title={transfer ? "Откуда" : writeOff ? "Списание" : "Приход"}/>}
    {transfer && <PlaceFields {...options} prefix="to" title="Куда"/>}
    {!(serialized && (transfer || writeOff)) && <label>Количество, шт.<input required name="quantity" type="number" min="1" step="1" max={serialized ? 100 : undefined} defaultValue="1"/></label>}
    <label>{writeOff ? "Причина списания" : "Комментарий"}<textarea name="reason" required={writeOff} maxLength={500} rows={3}/></label>
    {writeOff && <label className="confirm-check"><input type="checkbox" name="confirmed" value="yes" required/> Подтверждаю физическое списание</label>}
    <button className={writeOff ? "danger" : "primary"} disabled={!variant}>{button}</button>
  </RetainedActionForm>;
}
