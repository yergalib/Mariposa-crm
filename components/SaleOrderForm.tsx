"use client";
import { DiscountBreakdown } from "./DiscountBreakdown";
import {RetainedActionForm,type RetainedFormAction} from "@/components/RetainedActionForm";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { OperationalItemSelector } from "@/components/OperationalItemSelector";
import type { OperationalIdentifierResult, SafeSize } from "@/lib/inventory/operational-contract";
import type { SaleVariantQuote } from "@/lib/sales/mobile";
import { quoteSaleVariantAction, searchSaleCustomersAction, searchSaleItemsAction } from "@/app/sales/actions";

type Customer = { id: string; customerNumber: string; firstName: string; lastName: string | null; contacts?: Array<{ value: string }> };
type Branch = { id: string; name: string };
type SaleLine = SaleVariantQuote & { quantity: number; unitPriceMinor: string; discountMinor: string; adjustmentReason: string; productInstanceIds: string[] };

const meaningfulLength = (value: string) => (value.match(/[\p{L}\p{N}]/gu) ?? []).length;
const amount = (value: string) => /^\d+$/.test(value) ? BigInt(value) : BigInt(0);
const money = (value: bigint, currency = "KZT") => `${value.toLocaleString("ru-KZ")} ${currency === "KZT" ? "₸" : currency}`;
const sizeLabel = (size: SafeSize) => size.sizeSystem === "ONE_SIZE" ? "Без размера" : size.sizeSystem === "VOLUME_ML" ? `${size.code} мл` : size.recommendedHeightCm ? `${size.code} · рост ${size.recommendedHeightCm} см` : size.lengthCm ? `${size.code} · ${size.lengthCm} см` : size.name || size.code;

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="primary order-submit" disabled={pending || disabled} aria-busy={pending}>{pending ? "Создаём…" : "Создать продажу"}</button>;
}

export function SaleOrderForm({ action, branches, creationKey, defaultCustomer, canOverridePrice, canDiscount, fitting }: { action: RetainedFormAction; branches: Branch[]; creationKey: string; defaultCustomer?: Customer; canOverridePrice:boolean; canDiscount:boolean; fitting?: { id:string; branchId:string; quotes:SaleVariantQuote[]; assignedMembershipId:string; members:{id:string;name:string}[]; source:string } }) {
  const [branchId, setBranchId] = useState(fitting?.branchId ?? (branches.length === 1 ? branches[0]!.id : ""));
  const [customerQuery, setCustomerQuery] = useState(""), [customers, setCustomers] = useState<Customer[]>(defaultCustomer ? [defaultCustomer] : []), [customerId, setCustomerId] = useState(defaultCustomer?.id ?? "");
  const [customerState, setCustomerState] = useState<"idle" | "loading" | "done">("idle");
  const [itemQuery, setItemQuery] = useState(""), [quotes, setQuotes] = useState<SaleVariantQuote[]>([]), [itemState, setItemState] = useState<"idle" | "loading" | "done">("idle");
  const [lines, setLines] = useState<SaleLine[]>(()=>fitting?.quotes.map(quote=>({...quote,quantity:1,unitPriceMinor:quote.defaultPriceMinor??"",discountMinor:"0",adjustmentReason:"",productInstanceIds:[]}))??[]), [orderDiscount, setOrderDiscount] = useState("0"), [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const customerRequest = useRef(0), itemRequest = useRef(0);
  const customer = customers.find((row) => row.id === customerId);

  useEffect(() => {
    if (customerId || meaningfulLength(customerQuery) < 3) return;
    const request = ++customerRequest.current, query = customerQuery.trim();
    const timer = window.setTimeout(() => {
      setCustomerState("loading");
      startTransition(async () => {
        const response = await searchSaleCustomersAction(query);
        if (request !== customerRequest.current) return;
        setCustomers(response.ok ? response.results : []);
        setCustomerState("done");
        if (!response.ok) setMessage(response.message);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [customerId, customerQuery]);

  useEffect(() => {
    if (!branchId || meaningfulLength(itemQuery) < 3) return;
    const request = ++itemRequest.current, query = itemQuery.trim();
    const timer = window.setTimeout(() => {
      setItemState("loading");
      startTransition(async () => {
        const response = await searchSaleItemsAction(query, branchId);
        if (request !== itemRequest.current) return;
        setQuotes(response.ok ? response.results : []);
        setItemState("done");
        if (!response.ok) setMessage(response.message);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [branchId, itemQuery]);

  const addQuote = (quote: SaleVariantQuote, instance?: { id: string }) => {
    if (!quote.canFulfill) { setMessage("Товар сейчас недоступен для продажи."); return; }
    setLines((current) => {
      const existing = current.find((row) => row.variantId === quote.variantId);
      if (quote.trackingMode === "SERIALIZED") {
        if (!instance) { setMessage("Для поэкземплярного товара выберите или отсканируйте конкретный экземпляр."); return current; }
        if (existing?.productInstanceIds.includes(instance.id)) { setMessage("Этот экземпляр уже добавлен."); return current; }
        const ids = [...(existing?.productInstanceIds ?? []), instance.id];
        return existing ? current.map((row) => row.variantId === quote.variantId ? { ...row, productInstanceIds: ids, quantity: ids.length } : row) : [...current, { ...quote, quantity: 1, unitPriceMinor:quote.defaultPriceMinor??"", discountMinor: "0", adjustmentReason: "", productInstanceIds: [instance.id] }];
      }
      const quantity = (existing?.quantity ?? 0) + 1;
      if (quantity > quote.availableCapacity) { setMessage(`Доступно только ${quote.availableCapacity}.`); return current; }
      return existing ? current.map((row) => row.variantId === quote.variantId ? { ...row, quantity } : row) : [...current, { ...quote, quantity: 1, unitPriceMinor:quote.defaultPriceMinor??"", discountMinor: "0", adjustmentReason: "", productInstanceIds: [] }];
    });
    setMessage("Товар добавлен в продажу.");
  };

  const addVariant = (variantId: string, instance?: { id: string }) => startTransition(async () => {
    if (!branchId) { setMessage("Сначала выберите филиал."); return; }
    const response = await quoteSaleVariantAction(variantId, branchId);
    if (!response.ok) { setMessage(response.message); return; }
    addQuote(response.result, instance);
  });

  const scanned = (result: Extract<OperationalIdentifierResult, { kind: "BULK_VARIANT" | "SERIALIZED_INSTANCE" }>) => addVariant(result.variant.id, result.kind === "SERIALIZED_INSTANCE" ? result.instance : undefined);
  const grouped = useMemo(() => {
    const products = new Map<string, { product: SaleVariantQuote["product"]; executions: Map<string, { name: string | null; rows: SaleVariantQuote[] }> }>();
    for (const quote of quotes) {
      let product = products.get(quote.product.id);
      if (!product) { product = { product: quote.product, executions: new Map() }; products.set(quote.product.id, product); }
      const keyValue = quote.execution?.id ?? "direct";
      let execution = product.executions.get(keyValue);
      if (!execution) { execution = { name: quote.execution?.name ?? null, rows: [] }; product.executions.set(keyValue, execution); }
      execution.rows.push(quote);
    }
    return [...products.values()];
  }, [quotes]);
  const payload = JSON.stringify(lines.map((line) => ({ productVariantId: line.variantId, quantity: line.quantity, unitPriceMinor:line.unitPriceMinor, discountMinor: line.discountMinor || "0", adjustmentReason: line.adjustmentReason || null, productInstanceIds: line.productInstanceIds })));
  const total = lines.reduce((sum, line) => sum + amount(line.unitPriceMinor) * BigInt(line.quantity) - amount(line.discountMinor), BigInt(0)) - amount(orderDiscount);
  const disabled = !branchId || !customerId || !lines.length || total < BigInt(0) || pending || lines.some((line) => !/^\d+$/.test(line.unitPriceMinor)||line.quantity > line.availableCapacity || (line.trackingMode === "SERIALIZED" && line.productInstanceIds.length !== line.quantity));

  return <RetainedActionForm action={action} className="order-workspace mobile-sale-order">
    {fitting&&<><input type="hidden" name="fittingId" value={fitting.id}/><input type="hidden" name="branchId" value={fitting.branchId}/><input type="hidden" name="source" value={fitting.source}/><label>Ответственный<select name="assignedMembershipId" defaultValue={fitting.assignedMembershipId}>{fitting.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label></>}
    <input type="hidden" name="customerId" value={customerId}/><input type="hidden" name="itemsJson" value={payload}/><input type="hidden" name="idempotencyKey" value={creationKey}/>
    <div className="order-builder">
      <section className="ui-card order-step"><header><i>1</i><div><h2>Клиент</h2><p>Клиент обязателен по текущей модели продажи.</p></div></header>{customer ? <div className="selected-entity"><span><b>{customer.firstName} {customer.lastName}</b><small>{customer.contacts?.[0]?.value ?? "Телефон не указан"} · Клиент №{customer.customerNumber}</small></span><button type="button" className="text-button" onClick={() => { setCustomerId(""); setCustomerQuery(""); setCustomers([]); }}>Изменить</button></div> : <><label className="live-search-field">Поиск клиента<input value={customerQuery} onChange={(event) => { customerRequest.current++; setCustomerQuery(event.target.value); setCustomers([]); setCustomerState("idle"); }} placeholder="Имя, телефон или номер" autoComplete="off"/></label>{meaningfulLength(customerQuery) >= 3 && <div className="lookup-results live-suggestions" role="listbox" aria-busy={customerState === "loading"}>{customers.map((row) => <button type="button" key={row.id} onClick={() => setCustomerId(row.id)}><b>{row.firstName} {row.lastName}</b><small>{row.contacts?.[0]?.value ?? "Телефон не указан"}</small><small>Клиент №{row.customerNumber}</small></button>)}{customerState === "loading" && <p>Ищем клиентов…</p>}{customerState === "done" && !customers.length && <p>Клиенты не найдены</p>}</div>}<Link className="ui-button secondary" href="/customers/new">+ Новый клиент</Link></>}</section>
      <section className="ui-card order-step"><header><i>2</i><div><h2>Филиал</h2><p>Остаток и передача проверяются в выбранном филиале.</p></div></header><label>Филиал<select name="branchId" required disabled={Boolean(fitting)} value={branchId} onChange={(event) => { setBranchId(event.target.value); setLines([]); setQuotes([]); }}><option value="">Выберите филиал</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label></section>
      <section className="ui-card order-step sale-items-step"><header><i>3</i><div><h2>Товары</h2><p>Поиск, SKU, аппаратный сканер или камера.</p></div></header><div className="rental-item-tools"><OperationalItemSelector purpose="ORDER_ITEM_SELECT" branchId={branchId} triggerLabel="Сканировать товар" onSelect={scanned} onProductSelectionRequired={(result) => setItemQuery(result.product.code)}/><label className="live-search-field">Поиск товара<input value={itemQuery} onChange={(event) => { itemRequest.current++; setItemQuery(event.target.value); setQuotes([]); setItemState("idle"); }} placeholder="Например: 538 или Белоснежка" autoComplete="off"/></label></div>{!branchId && meaningfulLength(itemQuery) >= 3 && <p className="notice">Сначала выберите филиал.</p>}{itemState === "loading" && <p className="muted">Ищем продаваемые товары и проверяем остаток…</p>}{grouped.length > 0 && <div className="rental-search-results grouped sale-search-results">{grouped.map((group) => <section className="rental-product-result" key={group.product.id}><header><strong>{group.product.name}</strong><small>Код {group.product.code}</small></header>{[...group.executions.entries()].map(([executionId, execution]) => <div className="rental-execution-result" key={executionId}>{execution.name && <b>{execution.name}</b>}{execution.rows.map((quote) => <article key={quote.variantId}><div><span>{sizeLabel(quote.size)}</span><small>SKU {quote.sku}</small></div><div className={quote.canFulfill ? "availability available" : "availability unavailable"}><b>{quote.canFulfill ? `Доступно ${quote.availableCapacity}` : "Недоступно"}</b><span>{quote.defaultPriceMinor===null?"Цена вводится при добавлении":`Рекомендовано ${money(BigInt(quote.defaultPriceMinor),quote.currency)}`}</span></div>{quote.trackingMode === "BULK" ? <button type="button" className="secondary" disabled={!quote.canFulfill || pending} onClick={() => addQuote(quote)}>Добавить</button> : <div className="sale-instance-options">{quote.availableInstances.length ? quote.availableInstances.map((instance) => <button type="button" className="secondary" key={instance.id} onClick={() => addQuote(quote, instance)}>{instance.inventoryNumber}</button>) : <span>Нет доступных экземпляров</span>}</div>}</article>)}</div>)}</section>)}</div>}{itemState === "done" && !grouped.length && <p className="muted">Продаваемые товары не найдены.</p>}
        <div className="rental-basket sale-basket">{lines.map((line) => <article key={line.variantId}><div className="rental-line-identity"><strong>{line.product.name}</strong><span>{line.execution?.name && `${line.execution.name} · `}{sizeLabel(line.size)}</span><small>{line.trackingMode === "SERIALIZED" ? `${line.productInstanceIds.length} экз. выбрано` : `SKU ${line.sku}`}</small></div><label>Количество<input type="number" min="1" max={line.availableCapacity} inputMode="numeric" value={line.quantity} readOnly={line.trackingMode === "SERIALIZED"} onChange={(event) => setLines((current) => current.map((row) => row.variantId === line.variantId ? { ...row, quantity: Math.max(1, Number(event.target.value) || 1) } : row))}/></label><label>Цена продажи<input inputMode="numeric" pattern="[0-9]*" required placeholder="Введите цену" readOnly={!canOverridePrice} value={line.unitPriceMinor} onChange={(event)=>setLines(current=>current.map(row=>row.variantId===line.variantId?{...row,unitPriceMinor:event.target.value.replace(/\D/g,"")}:row))}/></label><label>Скидка<input inputMode="numeric" pattern="[0-9]*" readOnly={!canDiscount} value={line.discountMinor} onChange={(event) => setLines((current) => current.map((row) => row.variantId === line.variantId ? { ...row, discountMinor: event.target.value.replace(/\D/g, "") } : row))}/></label><label>Причина корректировки<input maxLength={500} value={line.adjustmentReason} readOnly={!canDiscount&&!canOverridePrice} onChange={event=>setLines(current=>current.map(row=>row.variantId===line.variantId?{...row,adjustmentReason:event.target.value}:row))}/></label><button type="button" className="text-button danger-text" onClick={() => setLines((current) => current.filter((row) => row.variantId !== line.variantId))}>Удалить</button><span className="rental-line-state">{line.unitPriceMinor?money(amount(line.unitPriceMinor)*BigInt(line.quantity)-amount(line.discountMinor),line.currency):"Укажите цену"}</span></article>)}{!lines.length && <p className="muted">Добавьте хотя бы один товар.</p>}</div>
      </section>
      <details className="ui-card order-step order-extra"><summary>Дополнительно</summary><div className="form-grid"><label>Источник<select name="source" disabled={Boolean(fitting)} defaultValue={fitting?.source??"CRM"}><option value="CRM">В магазине</option><option value="PHONE">Телефон</option><option value="WHATSAPP">WhatsApp</option><option value="INSTAGRAM">Instagram</option><option value="WEBSITE">Сайт</option><option value="OTHER">Другое</option></select></label><label>Скидка продажи<input name="discountMinor" inputMode="numeric" pattern="[0-9]*" readOnly={!canDiscount} value={orderDiscount} onChange={(event) => setOrderDiscount(event.target.value.replace(/\D/g, ""))}/></label></div><label>Комментарий<textarea name="internalComment" maxLength={4000}/></label></details>
      {message && <p className="notice" role="status">{message}</p>}
    </div>
    <aside className="ui-card order-checkout"><div><h2>Итог продажи</h2><span>{lines.length} поз. · {lines.reduce((sum, line) => sum + line.quantity, 0)} шт.</span></div><strong>{total >= BigInt(0) ? money(total) : "Проверьте скидки"}</strong><small>Цена и остаток повторно проверяются сервером. Создание атомарно подтверждает продажу и резервирует товар.</small><DiscountBreakdown gross={lines.reduce((sum,line)=>sum+amount(line.unitPriceMinor)*BigInt(line.quantity),BigInt(0)).toString()} itemDiscount={lines.reduce((sum,line)=>sum+amount(line.discountMinor),BigInt(0)).toString()} orderDiscount={orderDiscount} currency="KZT"/><Submit disabled={disabled}/><Link href={fitting?`/fittings/${fitting.id}`:"/orders"}>Отмена</Link></aside>
  </RetainedActionForm>;
}
