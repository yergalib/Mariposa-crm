"use client";
import { useRef, useState, type FormEvent } from "react";
import type { PublicBranch, PublicProductDetail, PublicVariant } from "@/lib/showroom/contracts";
import type { SelectionCriteria } from "@/lib/assistant/selection";
import { InquiryForm } from "./InquiryForm";
import { PhotoPlaceholder, priceText } from "./ShowroomPresentation";
export function ShowroomProductDetail({ product, branches }: { product: PublicProductDetail; branches: PublicBranch[] }) {
  const [checked, setChecked] = useState<{ item: PublicVariant; filters: SelectionCriteria } | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const fetching = useRef(false);
  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fetching.current) return;
    const form = new FormData(event.currentTarget);
    const criteria = { branchId: String(form.get("branchId") ?? ""), variantId: String(form.get("variantId") ?? ""), from: String(form.get("from") ?? ""), until: String(form.get("until") ?? "") };
    fetching.current = true; setPending(true); setError("");
    try {
      const response = await fetch("/api/showroom/selection?" + new URLSearchParams(criteria), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Проверка временно недоступна.");
      if (!product.options.some(option => option.id === data.id) || data.id !== criteria.variantId) throw new Error("Обновите страницу товара.");
      setChecked({ item: data, filters: { branchId: criteria.branchId, from: criteria.from, until: criteria.until, size: data.size, search: "" } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Проверка временно недоступна."); }
    finally { fetching.current = false; setPending(false); }
  }
  return <section className="showroom-detail"><PhotoPlaceholder /><div className="showroom-contact"><h1>{product.name}</h1>{(product.execution || product.color) && <p>{product.execution || product.color}</p>}
    <form onSubmit={check} hidden={checked !== null}><p>Выберите размер, филиал и период аренды. До проверки дат наличие неизвестно.</p><fieldset disabled={pending} className="product-options">
      <label>Размер<select name="variantId" required defaultValue=""><option value="" disabled>Выберите размер</option>{product.options.map(option => <option key={option.id} value={option.id}>{option.size}</option>)}</select></label>
      <label>Город / филиал<select name="branchId" required defaultValue={branches[0]?.id}>{branches.map(branch => <option value={branch.id} key={branch.id}>{branch.city} — {branch.name} ({branch.timezone})</option>)}</select></label>
      <label>Начало аренды<input type="datetime-local" name="from" required /></label><label>Конец аренды<input type="datetime-local" name="until" required /></label>
      <p>Время — местное для выбранного филиала. Цену уточнит сотрудник.</p><button className="primary">{pending ? "Проверяем…" : "Проверить выбранные даты"}</button>
    </fieldset></form>
    {error && <p role="alert">{error}</p>}
    {checked && <><p>{priceText(checked.item.price)}</p><p role="status">{checked.item.available ? "Доступно на выбранные даты · требует подтверждения сотрудником" : "На эти даты недоступно · сотрудник может помочь с альтернативой"}</p><InquiryForm item={checked.item} filters={checked.filters} branchLabel={branches.find(branch => branch.id === checked.filters.branchId)?.name ?? ""} onNewSearch={() => { setChecked(null); setError(""); }} /></>}
  </div></section>;
}
