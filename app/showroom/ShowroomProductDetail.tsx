"use client";
import { useEffect, useRef, useState, type FormEvent, type SetStateAction } from "react";
import type { BrowseFilters, PublicBranch, PublicProductDetail, PublicVariant } from "@/lib/showroom/contracts";
import type { SelectionCriteria } from "@/lib/assistant/selection";
import { InquiryForm } from "./InquiryForm";
import { PhotoPlaceholder, priceText } from "./ShowroomPresentation";
import { FavoriteButton } from "./FavoriteButton";
import { AssistantLink } from "./AssistantLink";
import { uniqueSizeVariant } from "@/lib/showroom/size-selection";
import { useTabState } from "./TabState";
import { emptySelection, selectionState } from "@/lib/showroom/tab-state";
export function ShowroomProductDetail({ product, branches, initialCriteria }: { product: PublicProductDetail; branches: PublicBranch[]; initialCriteria?: BrowseFilters }) {
  const [lastCheck, setChecked] = useState<{ item: PublicVariant; filters: SelectionCriteria } | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [purpose, setPurpose] = useState<"booking" | "fitting" | null>(null);
  const [entryEdited, setEntryEdited] = useState(false);
  const [stored, storeSelection] = useTabState("selection", selectionState, { ...emptySelection, branchId: branches[0]?.id ?? "" });
  const hasEntryCriteria = initialCriteria && Boolean(initialCriteria.branchId || initialCriteria.from || initialCriteria.until || initialCriteria.size);
  const saved = !entryEdited && hasEntryCriteria ? { ...stored, branchId: initialCriteria.branchId || stored.branchId,
    from: initialCriteria.from || stored.from, until: initialCriteria.until || stored.until, size: initialCriteria.size || stored.size,
    variantId: initialCriteria.size ? "" : stored.variantId } : stored;
  function setSelection(value: SetStateAction<typeof stored>) {
    const next = typeof value === "function" ? value(saved) : value;
    setEntryEdited(true); storeSelection(next);
  }
  const selection = { ...saved, branchId: saved.branchId ? (branches.some(branch => branch.id === saved.branchId) ? saved.branchId : "") : branches[0]?.id ?? "", variantId: product.options.some(option => option.id === saved.variantId) ? saved.variantId : uniqueSizeVariant(product.options, saved.size) };
  const checked = lastCheck && lastCheck.item.id === selection.variantId && lastCheck.filters.branchId === selection.branchId && lastCheck.filters.from === selection.from && lastCheck.filters.until === selection.until ? lastCheck : null;
  const request = useRef<AbortController | null>(null), options = useRef<HTMLFormElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  function invalidate() { request.current?.abort(); request.current = null; setPending(false); setChecked(null); setPurpose(null); setError(""); }
  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (request.current) return;
    const form = new FormData(event.currentTarget);
    const criteria = { branchId: String(form.get("branchId") ?? ""), variantId: String(form.get("variantId") ?? ""), from: String(form.get("from") ?? ""), until: String(form.get("until") ?? "") };
    if (!criteria.from || !criteria.until || criteria.until <= criteria.from) { setError("Возврат должен быть позже получения."); return; }
    const controller = new AbortController(); request.current = controller; setChecked(null); setPending(true); setError("");
    try {
      const response = await fetch("/api/showroom/selection?" + new URLSearchParams(criteria), { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (request.current !== controller || controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "Проверка временно недоступна.");
      if (!product.options.some(option => option.id === data.id) || data.id !== criteria.variantId) throw new Error("Обновите страницу товара.");
      setChecked({ item: data, filters: { branchId: criteria.branchId, from: criteria.from, until: criteria.until, size: data.size, search: "" } });
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Проверка временно недоступна."); }
    finally { if (request.current === controller) { request.current = null; setPending(false); } }
  }
  function begin(next: "booking" | "fitting") {
    if (!checked) { setError("Для заявки выберите размер, филиал и период аренды и проверьте доступность. Это не время записи на примерку."); options.current?.querySelector("select")?.focus(); return; }
    setPurpose(next);
  }
  return <section className="showroom-detail product-detail-ready"><div className="product-gallery" aria-label="Галерея товара"><PhotoPlaceholder /><div className="product-gallery-slots" aria-hidden="true"><PhotoPlaceholder label="Место для дополнительного ракурса" /><PhotoPlaceholder label="Место для дополнительного ракурса" /></div></div>
    <div className="showroom-contact"><h1>{product.name}</h1>{(product.execution || product.color) && <p>{product.execution || product.color}</p>}
      {!checked?.item.price && !purpose ? <button type="button" className="product-price" onClick={() => { if (checked) begin("booking"); else { setError("Выберите размер и даты. Если цена не указана, её уточнит сотрудник по заявке."); options.current?.querySelector("select")?.focus(); } }}>Уточнить стоимость</button> : <p className="product-price">{checked ? priceText(checked.item.price) : "Уточнить стоимость"}</p>}
      {purpose && checked ? <><p>{purpose === "fitting" ? "Запрос сотруднику на примерку. Указанные ниже даты относятся к аренде; время примерки сотрудник согласует отдельно." : "Заявка ожидает подтверждения сотрудником."}</p><InquiryForm purpose={purpose} item={checked.item} filters={checked.filters} requestText={purpose === "fitting" ? "Запрос на примерку выбранного платья. Время примерки нужно согласовать отдельно. Указанные даты — планируемый период аренды." : undefined} branchLabel={branches.find(branch => branch.id === checked.filters.branchId)?.name ?? ""} onNewSearch={() => setPurpose(null)} /></> : <>
        <form ref={options} onSubmit={check} onChange={invalidate}><fieldset disabled={pending} className="product-options">
          <label>Размер<select name="variantId" required value={selection.variantId} onChange={event => setSelection(value => ({ ...value, variantId: event.target.value, size: product.options.find(option => option.id === event.target.value)?.size ?? "" }))}><option value="" disabled>Выберите размер</option>{product.options.map(option => <option key={option.id} value={option.id}>{option.size}</option>)}</select></label>
          <label>Город / филиал<select name="branchId" required value={selection.branchId} onChange={event => setSelection(value => ({ ...value, branchId: event.target.value }))}>{branches.map(branch => <option value={branch.id} key={branch.id}>{branch.city} — {branch.name}</option>)}</select></label>
          <label>Получение<input type="datetime-local" name="from" required value={selection.from} onChange={event => setSelection(value => ({ ...value, from: event.target.value }))} /></label><label>Возврат<input type="datetime-local" name="until" required min={selection.from || undefined} value={selection.until} onChange={event => setSelection(value => ({ ...value, until: event.target.value }))} /></label>
          <p>Время — местное для выбранного филиала. До проверки дат наличие неизвестно.</p><button className="primary">{pending ? "Проверяем…" : "Проверить размер и даты"}</button>
        </fieldset></form>
        {pending && <button type="button" onClick={invalidate}>Отменить проверку</button>}
        {checked && <p role="status">{checked.item.available ? "Доступно на выбранные даты · требует подтверждения сотрудником" : "На эти даты недоступно · можно запросить альтернативу у сотрудника"}</p>}
        {error && <p role="alert">{error}</p>}
        <div className="product-primary-actions"><button type="button" className="primary" disabled={pending} onClick={() => begin("fitting")}>Запросить примерку</button><button type="button" disabled={pending} onClick={() => begin("booking")}>Оставить заявку на бронь</button></div>
      </>}
      <div className="product-secondary-actions"><FavoriteButton item={{ productId: product.productId, executionId: product.executionId }} /><AssistantLink products={[product]}>Спросить помощника</AssistantLink></div>
    </div>
  </section>;
}
