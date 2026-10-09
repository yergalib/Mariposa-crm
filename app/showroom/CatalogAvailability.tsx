import { RentalDateRange } from "./RentalDateRange";
import type { ReactNode } from "react";
import type { BrowseFilters, PublicBranch, PublicCategory } from "@/lib/showroom/contracts";
import { branchLabel } from "@/lib/showroom/categories";
import { colorGroups } from "@/lib/showroom/color-groups";
import { AssistantLink } from "./AssistantLink";

// Native GET navigation makes filters and Back/Forward reproducible without browser-only filtering.
export function CatalogAvailability({ branches, filters, children }: { branches: PublicBranch[]; categories: PublicCategory[]; filters: BrowseFilters; children: ReactNode }) {
  return <>
    <details className="catalog-controls"><summary>Фильтры <span>Цвет, размер и даты</span></summary>
    <form action="/showroom" method="get" className="catalog-color-filters" aria-label="Цвет, размер и даты">
      <input type="hidden" name="view" value="catalog" /><input type="hidden" name="categoryId" value={filters.categoryId} /><input type="hidden" name="search" value={filters.search} />
      <div className="catalog-filter-fields">
        <label>Цвет<select name="colorGroup" defaultValue={filters.colorGroup ?? ""}><option value="">Все цвета</option>{colorGroups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label>
        <label>Размер / рост на бирке<input name="size" defaultValue={filters.size ?? ""} maxLength={40} placeholder="Например, 140" /></label>
        <label>Филиал<select name="branchId" defaultValue={filters.branchId ?? ""}><option value="">Выберите для цены и наличия</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branchLabel(branch)}</option>)}</select></label>
        <RentalDateRange from={filters.from} until={filters.until} />
        <button className="primary">Показать платья</button>
      </div>
      <p className="site-muted">Без дат показаны размеры в каталоге. Для наличия выберите филиал и обе даты. Время — местное для филиала{filters.branchId ? ": " + branches.find(b => b.id === filters.branchId)?.timezone : ""}. Подбор не создаёт бронь.</p>
      {filters.colorGroup === "other" && <p className="site-muted">Здесь остальные цвета, смешанные и нераспознанные обозначения, а также товары без указанного цвета. Исходные обозначения сохранены в карточках.</p>}
      <details className="site-muted"><summary>Как выбрать размер</summary><p>Используйте размер или рост, указанный на бирке подходящего платья. Возраст не заменяет размер. Маркировка разных моделей может отличаться: мерки и посадку уточните у сотрудника перед примеркой.</p></details>
      <AssistantLink>Помочь с выбором и учесть повод</AssistantLink>
    </form></details>
    {children}
  </>;
}
