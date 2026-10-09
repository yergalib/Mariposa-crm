import type { ReactNode } from "react";
import { SiteHeader, SiteFooter } from "./SiteChrome";
import type { PublicVariant } from "@/lib/showroom/contracts";

export function ShowroomFrame({ children, intro = true }: { children: ReactNode; intro?: boolean }) {
  return <main className="showroom">
    <SiteHeader />
    {intro && <section className="showroom-intro"><p className="showroom-eyebrow">Шоурум MARIPOSA</p><h1>Каталог</h1><p>Выберите платье и оставьте заявку на бронь.<br />Сотрудник подтвердит наличие, цену и условия аренды.</p></section>}
    <div id="showroom-content">{children}</div>
    <SiteFooter />
  </main>;
}
export function PhotoPlaceholder({ label = "Фотография товара пока не добавлена" }: { label?: string }) {
  return <div className="showroom-photo" role="img" aria-label={label}><span aria-hidden="true">Фото скоро</span></div>;
}
export function priceText(price: PublicVariant["price"]) {
  if (!price) return "Уточнить стоимость";
  return `${BigInt(price.amountMinor).toLocaleString("ru-RU")} ${price.currency} · цена аренды в каталоге`;
}
export function ShowroomProductCard({ item, disabled, onSelect }: { item: PublicVariant; disabled?: boolean; onSelect: () => void }) {
  return <article className="showroom-product"><PhotoPlaceholder /><div className="showroom-product-info">
    <h2>{item.name}</h2><p>Размер {item.size}{item.execution ? ` · ${item.execution}` : ""}</p><p>{priceText(item.price)}</p>
    <p className="showroom-availability">{item.available ? "Доступно на выбранные даты · требует подтверждения" : "На эти даты недоступно · можно уточнить"}</p>
    <button className="showroom-request" disabled={disabled} onClick={onSelect}>Оставить заявку на бронь</button>
  </div></article>;
}
