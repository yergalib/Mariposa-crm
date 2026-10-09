import { browsePriceText } from "@/lib/showroom/prices";
import { FavoriteButton } from "./FavoriteButton";
import Link from "next/link";
import type { BrowseFilters, PublicBranch, PublicBrowse, PublicCategory } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { CatalogNavigation } from "./CatalogNavigation";
import { ProductPhoto } from "./ProductPhoto";
import { CatalogAvailability } from "./CatalogAvailability";
export function Showroom({ catalog, categories, filters, branches = [] }: { catalog: PublicBrowse; categories: PublicCategory[]; filters: BrowseFilters; branches?: PublicBranch[] }) {
  return <div className="catalog-layout"><CatalogNavigation categories={categories} filters={filters} /><section className="catalog-main" aria-label="Товары">
    <form key={"search:" + JSON.stringify(filters)} action="/showroom" method="get" className="catalog-search" role="search"><input type="hidden" name="view" value="catalog" /><input type="hidden" name="categoryId" value={filters.categoryId} />{(["colorGroup", "size", "branchId", "from", "until"] as const).map(name => <input key={name} type="hidden" name={name} value={filters[name] ?? ""} />)}<label>Поиск по названию<input name="search" type="search" defaultValue={filters.search} maxLength={80} placeholder="Найти платье" /></label><button>Найти</button>{filters.search && <Link href={browseHref({ ...filters, search: "", page: 1 })}>Сбросить поиск</Link>}</form>
    <CatalogAvailability key={"filters:" + JSON.stringify(filters)} branches={branches} categories={categories} filters={filters}>
    <p className="showroom-summary">Размер выбирается внутри цвета. Наличие на даты и условия брони подтвердит сотрудник.</p>
    {!catalog.items.length && <div className="showroom-empty"><p>По этому запросу товаров не найдено.</p><Link href="/showroom?view=catalog">Показать все товары</Link></div>}
    <div className="showroom-items">{catalog.items.map(item => <article className="showroom-product" key={item.id}><Link className="catalog-card-link" href={browseHref(filters, item)}><ProductPhoto key={item.images?.[0]?.id ?? "empty"} photo={item.images?.[0]} /><div className="showroom-product-info"><h2>{item.name}</h2><p>{item.colorLabel ?? item.execution ?? item.color ?? "Цвет не указан"}</p><p>{item.availableSizes ? "Доступные размеры на выбранные даты: " + (item.availableSizes.join(", ") || "нет") : (filters.size ? "Размеры в каталоге по фильтру: " : "Размеры в каталоге: ") + (item.sizes?.join(", ") || "уточните у сотрудника")}</p><span className="catalog-more">{browsePriceText(item.priceSummary)}</span></div></Link><FavoriteButton item={{ productId: item.productId, executionId: item.executionId }} /></article>)}</div>
    <nav className="showroom-pages" aria-label="Страницы каталога">{catalog.page > 1 && <Link href={browseHref({ ...filters, page: catalog.page - 1 })}>Предыдущая</Link>}<span>Страница {catalog.page}</span>{catalog.more && <Link href={browseHref({ ...filters, page: catalog.page + 1 })}>Следующая</Link>}</nav>
    </CatalogAvailability>
  </section></div>;
}
