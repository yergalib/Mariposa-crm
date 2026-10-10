import Link from "next/link";
import { activeCatalogFilters, defaultBranchId } from "@/lib/showroom/catalog-filters";
import { RentalDateRange } from "./RentalDateRange";
import type { ReactNode } from "react";
import type { BrowseFilters, PublicBranch, PublicCategory } from "@/lib/showroom/contracts";
import { branchLabel } from "@/lib/showroom/categories";
import { colorGroups } from "@/lib/showroom/color-groups";
import { AssistantLink } from "./AssistantLink";

// Native GET navigation makes filters and Back/Forward reproducible without browser-only filtering.
export function CatalogAvailability({ branches, categories, filters, children }: { branches: PublicBranch[]; categories: PublicCategory[]; filters: BrowseFilters; children: ReactNode }) {
  const active = activeCatalogFilters(filters, categories, branches);
  const branchId = defaultBranchId(branches, filters.branchId);
  return <>
    {active.length > 0 && <div className="catalog-active-filters" aria-label="Активные фильтры"><p>Активные фильтры: {active.length}</p><ul>{active.map(chip => <li key={chip.key}><Link href={chip.href} aria-label={`Убрать фильтр: ${chip.label}`}>{chip.label} <span aria-hidden="true">×</span></Link></li>)}</ul><Link className="catalog-clear-filters" href="/showroom?view=catalog">Сбросить все фильтры</Link></div>}
    {branches.length === 1 && <p className="site-muted">Филиал: {branchLabel(branches[0])} · {branches[0].timezone}</p>}
    <details className="catalog-controls"><summary>Фильтры{active.length > 0 ? ` (${active.length})` : ""} <span>Цвет, размер и даты</span></summary>
    <form action="/showroom" method="get" className="catalog-color-filters" aria-label="Цвет, размер и даты">
      <input type="hidden" name="view" value="catalog" /><input type="hidden" name="categoryId" value={filters.categoryId} /><input type="hidden" name="search" value={filters.search} />
      <div className="catalog-filter-fields">
        <label>Цвет<select name="colorGroup" defaultValue={filters.colorGroup ?? ""}><option value="">Все цвета</option>{colorGroups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label>
        <label>Размер / рост на бирке<input name="size" defaultValue={filters.size ?? ""} maxLength={40} placeholder="Например, 140" /></label>
        <label>Филиал<select name="branchId" defaultValue={branchId}><option value="">Выберите для цены и наличия</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branchLabel(branch)}</option>)}</select></label>
        <RentalDateRange from={filters.from} until={filters.until} />
        <button className="primary">Показать платья</button>
      </div>
      <p className="site-muted">Без дат показаны размеры в каталоге. Для наличия выберите филиал и обе даты. Время — местное для филиала{branchId ? ": " + branches.find(b => b.id === branchId)?.timezone : ""}. Подбор не создаёт бронь.</p>
      {filters.colorGroup === "other" && <p className="site-muted">Здесь остальные цвета, смешанные и нераспознанные обозначения, а также товары без указанного цвета. Исходные обозначения сохранены в карточках.</p>}
      <details className="site-muted"><summary>Как выбрать размер</summary><p>Используйте размер или рост, указанный на бирке подходящего платья. Возраст не заменяет размер. Маркировка разных моделей может отличаться: мерки и посадку уточните у сотрудника перед примеркой.</p></details>
      <AssistantLink>Помочь с выбором и учесть повод</AssistantLink>
    </form></details>
    {children}
  </>;
}
