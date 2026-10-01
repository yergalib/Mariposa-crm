import type { ReactNode } from "react";
import Image from "next/image";
import type { PublicVariant } from "@/lib/showroom/contracts";

export function ShowroomFrame({ children, intro = true }: { children: ReactNode; intro?: boolean }) {
  return <main className="showroom">
    <header className="showroom-header"><a className="showroom-wordmark" href="/showroom" aria-label="MARIPOSA — витрина"><Image className="showroom-logo" src="/brand/mariposa-logo.png" width={1712} height={666} alt="MARIPOSA" unoptimized /></a><span>Детские и подростковые платья / Аренда</span></header>
    {intro && <section className="showroom-intro"><p className="showroom-eyebrow">Шоурум MARIPOSA</p><h1>Каталог</h1><p>Выберите платье и оставьте заявку на бронь.<br />Сотрудник подтвердит наличие, цену и условия аренды.</p></section>}
    {children}
    <footer className="showroom-footer"><span>MARIPOSA</span><p>Заявка ожидает подтверждения сотрудником.<br />Отправка формы не резервирует товар.</p></footer>
  </main>;
}
export function PhotoPlaceholder() {
  return <div className="showroom-photo" role="img" aria-label="Фотография товара пока не добавлена"><span>Фото скоро</span></div>;
}
export function priceText(price: PublicVariant["price"]) {
  if (!price) return "Цену уточнит сотрудник";
  return `${BigInt(price.amountMinor).toLocaleString("ru-RU")} ${price.currency} · цена аренды в каталоге`;
}
export function ShowroomProductCard({ item, disabled, onSelect }: { item: PublicVariant; disabled?: boolean; onSelect: () => void }) {
  return <article className="showroom-product"><PhotoPlaceholder /><div className="showroom-product-info">
    <h2>{item.name}</h2><p>Размер {item.size}{item.execution ? ` · ${item.execution}` : ""}</p><p>{priceText(item.price)}</p>
    <p className="showroom-availability">{item.available ? "Доступно на выбранные даты · требует подтверждения" : "На эти даты недоступно · можно уточнить"}</p>
    <button className="showroom-request" disabled={disabled} onClick={onSelect}>Оставить заявку на бронь</button>
  </div></article>;
}
