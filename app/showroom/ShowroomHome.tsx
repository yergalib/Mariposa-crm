import { browsePriceText } from "@/lib/showroom/prices";
import { HeroCarousel } from "./HeroCarousel";
import { heroSlides } from "./hero-slides";
import { colorGroups } from "@/lib/showroom/color-groups";
import { FavoriteButton } from "./FavoriteButton";
import Link from "next/link";
import type { PublicBrowseCard } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { PhotoPlaceholder } from "./ShowroomPresentation";
import { ProductPhoto } from "./ProductPhoto";
import { AssistantLink } from "./AssistantLink";
import { ContactActions } from "./SiteChrome";
import { benefits, brandStory, rentalSteps, showroomContact as contact } from "./site-content";

export function ShowroomHome({ items, catalogUnavailable = false }: { items: PublicBrowseCard[]; catalogUnavailable?: boolean }) {
  return <div className="showroom-home">
    <section className="site-hero"><div><h1>Найдите идеальное платье для вашего праздника</h1><p>Детские и подростковые праздничные платья в аренду.</p><div className="site-actions"><AssistantLink className="site-button site-primary">Помочь подобрать платье</AssistantLink><Link className="site-button" href="/showroom?view=catalog">Смотреть каталог</Link></div></div><HeroCarousel slides={heroSlides} fallback={<PhotoPlaceholder label="Место для главной фотографии MARIPOSA" />} /></section>
    <section className="site-section"><h2>Выберите цвет</h2><div className="site-color-groups">{colorGroups.map(group => <Link key={group.id} href={browseHref({ search: "", categoryId: "", page: 1, colorGroup: group.id })}><span className="site-color-swatch" style={{ backgroundColor: group.swatch }} aria-hidden="true" /><span>{group.label}</span></Link>)}</div><p className="site-muted">Цветовые образцы условные. Точный оттенок уточнит сотрудник.</p></section>
    <section className="site-section"><div className="site-section-heading"><h2>Платья из каталога</h2><Link href="/showroom?view=catalog">Смотреть все →</Link></div>
      {items.length ? <div className="showroom-items site-home-products">{items.map(item => <article className="showroom-product" key={item.id}><Link href={browseHref({ search: "", categoryId: "", page: 1 }, item)}><ProductPhoto key={item.images?.[0]?.id ?? "empty"} photo={item.images?.[0]} /><div className="showroom-product-info"><h3>{item.name}</h3><p>{item.colorLabel ?? item.execution ?? item.color ?? "Цвет не указан"}</p><p>Размеры в каталоге: {item.sizes?.join(", ") || "уточните у сотрудника"}</p><span>{browsePriceText(item.priceSummary)}</span></div></Link><FavoriteButton item={{ productId: item.productId, executionId: item.executionId }} /></article>)}</div> : <p className="site-muted">{catalogUnavailable ? "Каталог временно недоступен. Можно связаться с шоурумом." : "Платья появятся здесь после открытия каталога."}</p>}
    </section>
    <section className="site-section site-benefits"><h2>Праздничный образ без покупки платья на один раз</h2><div>{benefits.map(([title, description]) => <article key={title}><h3>{title}</h3><p>{description}</p></article>)}</div></section>
    <section className="site-section" id="rental"><h2>Как работает аренда</h2><ol className="site-steps">{rentalSteps.map((step, i) => <li key={step}><span>0{i + 1}</span><h3>{i === 1 ? <Link href="/showroom?view=fitting">{step}</Link> : step}</h3></li>)}</ol><p className="site-muted">Выберите платье и удобное время для примерки — остальное поможем организовать.</p></section>
    <section className="site-assistant"><div><h2>Выбирать легче вместе</h2><p>Не знаете, какое платье выбрать? Расскажите, для какого события нужен наряд, — помощник MARIPOSA найдёт подходящие варианты из нашего каталога.</p></div><AssistantLink className="site-button site-primary">Помочь подобрать платье</AssistantLink></section>
    <section className="site-section site-about"><PhotoPlaceholder label="Место для фотографии шоурума MARIPOSA" /><div><h2>О MARIPOSA</h2><p>{brandStory}</p></div></section>
    <section className="site-section site-contacts" id="contacts"><div><h2>Контакты</h2><h3>Local · {contact.city}</h3><p>{contact.address}</p><p>{contact.hours}</p></div><ContactActions /></section>
  </div>;
}
