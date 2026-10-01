import Link from "next/link";
import type { PublicBrowseCard } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { PhotoPlaceholder } from "./ShowroomPresentation";
import { FavoriteButton } from "./FavoriteButton";
export function ProductRecommendations({ other, complements }: { other: PublicBrowseCard[]; complements: PublicBrowseCard[] }) {
  return <>{[["Дополнить образ", "Обувь и аксессуары из опубликованного каталога. Сочетание и размер уточняются отдельно.", complements], ["Посмотреть похожие", "Другие платья из каталога — без оценки сходства, посадки или совместимости.", other]].map(([title, description, items]) => (items as PublicBrowseCard[]).length > 0 && <section className="site-section" key={title as string}><h2>{title as string}</h2><p className="site-muted">{description as string}</p><div className="showroom-items">{(items as PublicBrowseCard[]).map(item => <article className="showroom-product" key={item.id}><Link href={browseHref({ search: "", categoryId: "", page: 1 }, item)}><PhotoPlaceholder /><h3>{item.name}</h3><p>{item.execution || item.color}</p><p>Уточнить стоимость</p></Link><FavoriteButton item={{ productId: item.productId, executionId: item.executionId }} /></article>)}</div></section>)}</>;
}
