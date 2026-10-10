"use client";
import Link from "next/link";
import type { ChatCard } from "@/lib/assistant/chat/contracts";
import type { PublicProductDetail } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { ProductPhoto } from "./ProductPhoto";
import { FavoriteButton } from "./FavoriteButton";
import { priceText } from "./ShowroomPresentation";

// Tool DTOs only. Model text never supplies IDs, price, photos or availability.
export function AssistantProductCard({ card, pending, onSelect }: { card: ChatCard; pending: boolean; onSelect: () => void }) {
  return <article className="showroom-product"><ProductPhoto photo={card.images?.[0]} /><div className="showroom-product-info">
    <h3>{card.item.name}</h3><p>{card.item.execution} · Размер {card.item.size}</p><p>{priceText(card.item.price)}</p>
    <p>{card.from.replace("T", " ")} — {card.until.replace("T", " ")}</p>
    <p>{card.item.available ? "Доступно на выбранные даты · требует подтверждения" : "На выбранные даты недоступно"}</p>
    {card.reasons?.length ? <ul aria-label="Почему показан вариант">{card.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : null}
    <button type="button" disabled={pending} onClick={onSelect}>Выбрать в комплект</button>
    <FavoriteButton item={{ productId: card.productId, executionId: card.executionId }} />
    <Link href={browseHref({ search: "", categoryId: "", page: 1, branchId: card.branchId, from: card.from, until: card.until, size: card.item.size }, card)}>Подробнее о товаре</Link>
  </div></article>;
}
export function AssistantComparisonCard({ product }: { product: PublicProductDetail }) {
  return <article className="showroom-product"><ProductPhoto photo={product.images?.[0]} /><div className="showroom-product-info">
    <h3>{product.name}</h3><p>{product.colorLabel ?? "Цвет уточнит сотрудник"}</p><p>Размеры в каталоге: {product.sizes.join(", ")}</p>
    <p>Цена и наличие ещё не проверены для выбранного размера и периода.</p>
    <FavoriteButton item={{ productId: product.productId, executionId: product.executionId }} />
    <Link href={browseHref({ search: "", categoryId: "", page: 1 }, product)}>Выбрать размер и даты</Link>
  </div></article>;
}
