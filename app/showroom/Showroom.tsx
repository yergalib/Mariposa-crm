import Link from "next/link";
import type { BrowseFilters, PublicBranch, PublicBrowse, PublicCategory } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { CatalogNavigation } from "./CatalogNavigation";
import { PhotoPlaceholder } from "./ShowroomPresentation";
import { CatalogAvailability } from "./CatalogAvailability";
export function Showroom({ catalog, categories, filters, branches = [] }: { catalog: PublicBrowse; categories: PublicCategory[]; filters: BrowseFilters; branches?: PublicBranch[] }) {
  return <div className="catalog-layout"><CatalogNavigation categories={categories} filters={filters} /><section className="catalog-main" aria-label="Товары">
    <form action="/showroom" method="get" className="catalog-search" role="search"><input type="hidden" name="view" value="catalog" /><input type="hidden" name="categoryId" value={filters.categoryId} /><label>Поиск по названию<input name="search" type="search" defaultValue={filters.search} maxLength={80} placeholder="Найти платье" /></label><button>Найти</button>{filters.search && <Link href={browseHref({ ...filters, search: "", page: 1 })}>Сбросить поиск</Link>}</form>
    <CatalogAvailability key={JSON.stringify(filters)} branches={branches} categories={categories} filters={filters}>
    <p className="showroom-summary">Откройте понравившееся платье, чтобы выбрать размер и даты. Наличие и цену подтвердит сотрудник.</p>
    {!catalog.items.length && <div className="showroom-empty"><p>По этому запросу товаров не найдено.</p><Link href="/showroom?view=catalog">Показать все товары</Link></div>}
    <div className="showroom-items">{catalog.items.map(item => <article className="showroom-product" key={item.id}><Link className="catalog-card-link" href={browseHref(filters, item)}><PhotoPlaceholder /><div className="showroom-product-info"><h2>{item.name}</h2>{(item.execution || item.color) && <p>{item.execution || item.color}</p>}<span className="catalog-more">Уточнить стоимость</span></div></Link></article>)}</div>
    <nav className="showroom-pages" aria-label="Страницы каталога">{catalog.page > 1 && <Link href={browseHref({ ...filters, page: catalog.page - 1 })}>Предыдущая</Link>}<span>Страница {catalog.page}</span>{catalog.more && <Link href={browseHref({ ...filters, page: catalog.page + 1 })}>Следующая</Link>}</nav>
    </CatalogAvailability>
  </section></div>;
}
