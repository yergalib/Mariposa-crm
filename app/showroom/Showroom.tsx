"use client";
import { useRef, useState, type FormEvent } from "react";
import type { PublicBranch, PublicCatalog, PublicVariant } from "@/lib/showroom/contracts";

import type { SelectionCriteria as Filters, SelectionHandoff } from "@/lib/assistant/selection";
import { webSelectionAdapter } from "@/lib/assistant/web-adapter";
import { GuidedSelection } from "./GuidedSelection";
function priceText(price: PublicVariant["price"]) {
  if (!price) return "Цену уточнит сотрудник";
  // Match the CRM's amountMinor convention without an invented duration multiplier.
  return `${BigInt(price.amountMinor).toLocaleString("ru-RU")} ${price.currency} — цена аренды в каталоге`;
}
function InquiryForm({ item, filters, onNewSearch }: SelectionHandoff & { onNewSearch: () => void }) {
  const [contact, setContact] = useState(""), [website, setWebsite] = useState("");
  const [pending, setPending] = useState(false), [locked, setLocked] = useState(false);
  const [done, setDone] = useState(false), [error, setError] = useState("");
  const sending = useRef(false), payload = useRef<object | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || done) return;
    sending.current = true; setPending(true); setError(""); setLocked(true);
    payload.current ??= { branchId: filters.branchId, from: filters.from, until: filters.until,
      variantId: item.id, replyContact: contact, website, creationKey: crypto.randomUUID() };
    try {
      const response = await fetch("/api/showroom/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload.current) });
      const data = await response.json();
      if (!response.ok) {
        // Validation failures do not save. On uncertain delivery retain the exact payload/key.
        if ([400, 413, 415].includes(response.status)) { payload.current = null; setLocked(false); }
        throw new Error(data.error || "Не удалось отправить заявку.");
      }
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Связь прервалась. Повторите отправку этой же заявки."); }
    finally { sending.current = false; setPending(false); }
  }
  if (done) return <div><p role="status">Заявка на бронь принята. Ожидает подтверждения сотрудником. Товар пока не зарезервирован.</p><button onClick={onNewSearch}>Новый поиск</button></div>;
  return <form onSubmit={submit} className="showroom-contact">
    <h2>Заявка на бронь: {item.name}, {item.size}</h2>
    <p>{filters.from.replace("T", " ")} — {filters.until.replace("T", " ")}, по времени выбранного филиала.</p>
    <label>Телефон или email<input required maxLength={254} value={contact} onChange={e => setContact(e.target.value)} readOnly={locked} autoComplete="off" /></label>
    <label className="showroom-trap" aria-hidden="true">Ваш сайт<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
    <p>Контакт нужен сотруднику MARIPOSA только для ответа по этой заявке. Не указывайте документы, платёжные данные или другие личные сведения.</p>
    <p>Цена и наличие требуют подтверждения сотрудником. Оплата и автоматическая бронь здесь не выполняются.</p>
    {error && <p role="alert">{error}{locked ? " Повторная отправка использует ту же заявку; данные зафиксированы до получения ответа." : ""}</p>}
    <button className="primary" disabled={pending}>{pending ? "Отправляем…" : "Отправить заявку на бронь"}</button>
    {!locked && <button type="button" onClick={onNewSearch}>Изменить выбор</button>}
  </form>;
}
export function Showroom({ branches }: { branches: PublicBranch[] }) {
  const [mode, setMode] = useState<"search" | "guided">("search");
  const [filters, setFilters] = useState<Filters>({ branchId: branches[0].id, from: "", until: "", search: "", size: "" });
  const [shown, setShown] = useState<Filters | null>(null), [result, setResult] = useState<PublicCatalog | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [selected, setSelected] = useState<PublicVariant | null>(null);
  const fetching = useRef(false);
  async function search(input: Filters, page = 1) {
    if (fetching.current) return;
    fetching.current = true; setPending(true); setError(""); setSelected(null); setResult(null);
    try {
      const data = await webSelectionAdapter.findOptions(input, page);
      setShown(input); setResult(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Поиск недоступен."); }
    finally { fetching.current = false; setPending(false); }
  }
  const change = (key: keyof Filters, value: string) => {
    setFilters(current => ({ ...current, [key]: value }));
    setResult(null); setShown(null); setError("");
  };
  return <>
    <div className="showroom-pages" aria-label="Способ поиска">{(["search", "guided"] as const).map(value => <button key={value} aria-pressed={mode === value} disabled={pending || selected !== null} onClick={() => { setMode(value); setResult(null); setShown(null); setError(""); }}>{value === "search" ? "Обычный поиск" : "Пошаговый подбор"}</button>)}</div>
    {mode === "guided" ? <GuidedSelection branches={branches} criteria={filters} onChange={change} onSearch={search} disabled={pending || selected !== null} pending={pending} /> : <form onSubmit={e => { e.preventDefault(); void search(filters); }}>
      <fieldset disabled={pending || selected !== null} className="showroom-filters">
        <label>Город / филиал<select value={filters.branchId} onChange={e => change("branchId", e.target.value)}>{branches.map(b => <option key={b.id} value={b.id}>{b.city} — {b.name} ({b.timezone})</option>)}</select></label>
        <label>Название<input maxLength={80} value={filters.search} onChange={e => change("search", e.target.value)} /></label>
        <label>Размер<input maxLength={40} placeholder="Любой" value={filters.size} onChange={e => change("size", e.target.value)} /></label>
        <label>Начало аренды<input required type="datetime-local" value={filters.from} onChange={e => change("from", e.target.value)} /></label>
        <label>Конец аренды<input required type="datetime-local" value={filters.until} onChange={e => change("until", e.target.value)} /></label>
        <button className="primary">{pending ? "Проверяем…" : "Показать товары"}</button>
      </fieldset>
    </form>}
    {error && <p role="alert">{error}</p>}
    {result && shown && <>
      <p>Результат для {branches.find(b => b.id === shown.branchId)?.name}: {shown.from.replace("T", " ")} — {shown.until.replace("T", " ")}. Наличие может измениться.</p>
      {!result.items.length && <p>По выбранным условиям товаров не найдено.</p>}
      <div className="showroom-items">{result.items.map(item => <article key={item.id} className="card">
        <div className="showroom-photo">Фото пока нет</div><h2>{item.name}</h2>
        <p>Размер: {item.size}{item.execution ? ` · ${item.execution}` : ""}</p><p>{priceText(item.price)}</p>
        <p>{item.available ? "Есть доступное количество на выбранные даты" : "Доступного количества нет — можно уточнить у сотрудника"}</p>
        <button disabled={selected !== null || pending} onClick={() => setSelected(item)}>Оставить заявку на бронь</button>
      </article>)}</div>
      <div className="showroom-pages"><button disabled={result.page <= 1 || pending || selected !== null} onClick={() => void search(shown, result.page - 1)}>Назад</button>
        <span>Страница {result.page}</span><button disabled={!result.more || pending || selected !== null} onClick={() => void search(shown, result.page + 1)}>Далее</button></div>
      {selected && <InquiryForm key={selected.id} item={selected} filters={shown} onNewSearch={() => setSelected(null)} />}
    </>}
  </>;
}
