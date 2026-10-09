import { browsePriceText } from "@/lib/showroom/prices";
import Link from "next/link";
import type { BrowseFilters, PublicBrowseCard } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { ProductPhoto } from "./ProductPhoto";
import { FavoriteButton } from "./FavoriteButton";
export function ProductRecommendations({ other, complements, filters = { search: "", categoryId: "", page: 1 } }: { other: PublicBrowseCard[]; complements: PublicBrowseCard[]; filters?: BrowseFilters }) {
  return <>{[["Дополнить образ", "Обувь и аксессуары из опубликованного каталога. Сочетание и размер уточняются отдельно.", complements], ["Другие платья", "Другие платья из каталога — без оценки сходства, посадки или совместимости.", other]].map(([title, description, items]) => (items as PublicBrowseCard[]).length > 0 && <section className="site-section" key={title as string}><h2>{title as string}</h2><p className="site-muted">{description as string}</p><div className="showroom-items">{(items as PublicBrowseCard[]).map(item => <article className="showroom-product" key={item.id}><Link href={browseHref(items === complements ? { ...filters, size: "", colorGroup: "", search: "", categoryId: "", page: 1 } : { ...filters, search: "", page: 1 }, item)}><ProductPhoto key={item.images?.[0]?.id ?? "empty"} photo={item.images?.[0]} /><h3>{item.name}</h3><p>{item.execution || item.color}</p><p>{browsePriceText(item.priceSummary)}</p></Link><FavoriteButton item={{ productId: item.productId, executionId: item.executionId }} /></article>)}</div></section>)}</>;
}
