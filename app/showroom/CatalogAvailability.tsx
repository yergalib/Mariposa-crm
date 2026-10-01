"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { BrowseFilters, PublicBranch, PublicCatalog, PublicCategory, PublicVariant } from "@/lib/showroom/contracts";
import type { SelectionCriteria } from "@/lib/assistant/selection";
import { branchLabel, categoryIds } from "@/lib/showroom/categories";
import { ShowroomGroupCard } from "./ShowroomGroupCard";
import { InquiryForm } from "./InquiryForm";
import { AssistantLink } from "./AssistantLink";
import { occasions } from "./site-content";

type Result = { catalog: PublicCatalog; criteria: SelectionCriteria; page: number; occasion: string };
export function CatalogAvailability({ branches, categories, filters, children }: { branches: PublicBranch[]; categories: PublicCategory[]; filters: BrowseFilters; children: ReactNode }) {
  const request = useRef<AbortController | null>(null);
  const [result, setResult] = useState<Result | null>(null), [selected, setSelected] = useState<PublicVariant | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [occasion, setOccasion] = useState<typeof occasions[number] | "">("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const allowedCategories = filters.categoryId ? categories.filter(category => categoryIds(categories, filters.categoryId).includes(category.id)) : categories;
  useEffect(() => () => request.current?.abort(), []);
  function reset() { request.current?.abort(); request.current = null; setPending(false); setResult(null); setSelected(null); setError(""); }
  async function find(criteria: SelectionCriteria, page: number, chosenOccasion: string) {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller; setPending(true); setError("");
    try {
      const response = await fetch("/api/showroom/catalog?" + new URLSearchParams({ ...criteria, color: criteria.color ?? "", page: String(page) }), { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted || request.current !== controller) return;
      if (!response.ok) throw new Error(data.error || "Не удалось проверить каталог.");
      setResult({ catalog: data as PublicCatalog, criteria, page, occasion: chosenOccasion }); setSelected(null);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось проверить каталог."); }
    finally { if (request.current === controller) { request.current = null; setPending(false); } }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "");
    const from = value("from"), until = value("until");
    if (!from || !until || until <= from) { setError("Выберите получение и возврат: возврат должен быть позже получения."); return; }
    const categoryId = value("categoryId");
    void find({ branchId: value("branchId"), from, until, size: value("size"), search: filters.search, color: value("color"), ...(categoryId ? { categoryId } : {}) }, 1, occasion);
  }
  return <>
    <details className="catalog-filter-panel"><summary>Филиал, размер, цвет и даты</summary>
      <form onSubmit={submit} onChange={() => { if (result) { setResult(null); setSelected(null); } }}>
        <fieldset disabled={pending} className="catalog-filter-fields">
          <label>Филиал<select name="branchId" required value={branchId} onChange={event => setBranchId(event.target.value)}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branchLabel(branch)}</option>)}</select></label>
          <label>Размер / рост на бирке<input name="size" maxLength={40} placeholder="Например, 140" /></label>
          <label>Цвет<input name="color" maxLength={50} placeholder="Например, розовый; пусто — любой" /></label>
          <label>Категория<select name="categoryId" required={Boolean(filters.categoryId)} defaultValue={allowedCategories.length === 1 ? allowedCategories[0].id : ""}><option value="" disabled={Boolean(filters.categoryId)}>{filters.categoryId ? "Уточните категорию для проверки дат" : "Все категории"}</option>{allowedCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Получение<input name="from" type="datetime-local" required /></label><label>Возврат<input name="until" type="datetime-local" required /></label>
          <p className="catalog-filter-note">Время филиала: {branches.find(branch => branch.id === branchId)?.timezone}. До выбора дат можно свободно смотреть каталог. Размер не определяется автоматически по возрасту или росту.</p>
          <button className="primary">{pending ? "Проверяем…" : "Показать варианты на даты"}</button>
        </fieldset>
      </form>
      <div className="catalog-occasion"><label>Для какого события?<select value={occasion} onChange={event => setOccasion(event.target.value as typeof occasion)}><option value="">Выберите событие</option>{occasions.map(value => <option key={value}>{value}</option>)}</select></label><AssistantLink occasion={occasion || undefined}>Помочь подобрать платье</AssistantLink></div>
      <p className="site-muted">Повод передаётся помощнику как пожелание. Стоимость и бюджет можно уточнить у сотрудника; цены не подставляются автоматически.</p>
    </details>
    {pending && <p role="status">Проверяем каталог и доступность…</p>}{error && <p role="alert">{error}</p>}
    {(result || pending) && <button type="button" onClick={reset}>{pending ? "Отменить проверку" : "Вернуться ко всему каталогу"}</button>}
    {result ? <section aria-label="Результаты на выбранные даты" aria-busy={pending}>
      <p>{branches.find(branch => branch.id === result.criteria.branchId)?.name} · {result.criteria.from.replace("T", " ")} — {result.criteria.until.replace("T", " ")}{result.criteria.size && ` · Размер ${result.criteria.size}`}{result.criteria.color && ` · Цвет: ${result.criteria.color}`}</p>
      <p className="site-muted">Наличие требует подтверждения сотрудником. Подбор не создаёт бронь.</p>
      {selected ? <InquiryForm item={selected} filters={result.criteria} branchLabel={branches.find(branch => branch.id === result.criteria.branchId)?.name ?? ""} requestText={result.occasion ? `Событие: ${result.occasion}` : undefined} onNewSearch={() => setSelected(null)} /> : <>
        {!result.catalog.items.length && <p role="status">По этим условиям вариантов не найдено. Можно изменить условия или обратиться к сотруднику.</p>}
        <div className="showroom-items">{result.catalog.items.map(item => <ShowroomGroupCard key={item.id} item={item} disabled={pending} onSelect={setSelected} />)}</div>
        <nav className="showroom-pages" aria-label="Страницы результатов">{result.page > 1 && <button disabled={pending} onClick={() => void find(result.criteria, result.page - 1, result.occasion)}>Предыдущая</button>}<span>Страница {result.page}</span>{result.catalog.more && <button disabled={pending} onClick={() => void find(result.criteria, result.page + 1, result.occasion)}>Следующая</button>}</nav>
      </>}
    </section> : children}
  </>;
}
