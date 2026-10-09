import Link from "next/link";
import type { BrowseFilters, PublicBrowseCard } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { PhotoPlaceholder } from "./ShowroomPresentation";
import { FavoriteButton } from "./FavoriteButton";
export function ProductRecommendations({ other, complements, filters = { search: "", categoryId: "", page: 1 } }: { other: PublicBrowseCard[]; complements: PublicBrowseCard[]; filters?: BrowseFilters }) {
  return <>{[["Дополнить образ", "Обувь и аксессуары из опубликованного каталога. Сочетание и размер уточняются отдельно.", complements], ["Другие платья", "Другие платья из каталога — без оценки сходства, посадки или совместимости.", other]].map(([title, description, items]) => (items as PublicBrowseCard[]).length > 0 && <section className="site-section" key={title as string}><h2>{title as string}</h2><p className="site-muted">{description as string}</p><div className="showroom-items">{(items as PublicBrowseCard[]).map(item => <article className="showroom-product" key={item.id}><Link href={browseHref(filters, item)}><PhotoPlaceholder /><h3>{item.name}</h3><p>{item.execution || item.color}</p><p>Уточнить стоимость</p></Link><FavoriteButton item={{ productId: item.productId, executionId: item.executionId }} /></article>)}</div></section>)}</>;
}
