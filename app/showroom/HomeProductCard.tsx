import Link from "next/link";
import type { PublicBrowseCard } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { browsePriceText } from "@/lib/showroom/prices";
import { ProductPhoto } from "./ProductPhoto";
import { FavoriteButton } from "./FavoriteButton";

// Editorial home card. Full variants and availability belong on the product page.
export function HomeProductCard({ item }: { item: PublicBrowseCard }) {
  return <article className="showroom-product home-product-card">
    <Link href={browseHref({ search: "", categoryId: "", page: 1 }, item)}>
      <ProductPhoto key={item.images?.[0]?.id ?? "empty"} photo={item.images?.[0]} />
      <div className="showroom-product-info"><h3 title={item.name}>{item.name}</h3><span>{browsePriceText(item.priceSummary)}</span></div>
    </Link>
    <FavoriteButton item={{ productId: item.productId, executionId: item.executionId }} iconOnly />
  </article>;
}
