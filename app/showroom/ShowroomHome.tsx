import Link from "next/link";
import type { PublicBrowseCard } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { PhotoPlaceholder } from "./ShowroomPresentation";
import { AssistantLink } from "./AssistantLink";
import { ContactActions } from "./SiteChrome";
import { benefits, brandStory, occasions, rentalSteps, showroomContact as contact } from "./site-content";

export function ShowroomHome({ items, catalogUnavailable = false }: { items: PublicBrowseCard[]; catalogUnavailable?: boolean }) {
  return <div className="showroom-home">
    <section className="site-hero"><div><h1>Найдите идеальное платье для вашего праздника</h1><p>Детские и подростковые праздничные платья в аренду.</p><div className="site-actions"><AssistantLink className="site-button site-primary">Помочь подобрать платье</AssistantLink><Link className="site-button" href="/showroom?view=catalog">Смотреть каталог</Link></div></div><PhotoPlaceholder label="Место для главной фотографии MARIPOSA" /></section>
    <section className="site-section"><h2>Для какого события ищете платье?</h2><div className="site-occasions">{occasions.map(occasion => <AssistantLink key={occasion} occasion={occasion} className="site-button">{occasion}</AssistantLink>)}</div></section>
    <section className="site-section"><div className="site-section-heading"><h2>Популярные платья</h2><Link href="/showroom?view=catalog">Смотреть все →</Link></div>
      {items.length ? <div className="showroom-items site-home-products">{items.map(item => <article className="showroom-product" key={item.id}><Link href={browseHref({ search: "", categoryId: "", page: 1 }, item)}><PhotoPlaceholder /><div className="showroom-product-info"><h3>{item.name}</h3>{(item.execution || item.color) && <p>{item.execution || item.color}</p>}<span>Уточнить стоимость</span></div></Link></article>)}</div> : <p className="site-muted">{catalogUnavailable ? "Каталог временно недоступен. Можно связаться с шоурумом." : "Платья появятся здесь после открытия каталога."}</p>}
    </section>
    <section className="site-section site-benefits"><h2>Праздничный образ без покупки платья на один раз</h2><div>{benefits.map(([title, description]) => <article key={title}><h3>{title}</h3><p>{description}</p></article>)}</div></section>
    <section className="site-section" id="rental"><h2>Как работает аренда</h2><ol className="site-steps">{rentalSteps.map((step, i) => <li key={step}><span>0{i + 1}</span><h3>{step}</h3></li>)}</ol><p className="site-muted">Выберите платье и удобное время для примерки — остальное поможем организовать.</p></section>
    <section className="site-assistant"><div><h2>Выбирать легче вместе</h2><p>Не знаете, какое платье выбрать? Расскажите, для какого события нужен наряд, — помощник MARIPOSA найдёт подходящие варианты из нашего каталога.</p></div><AssistantLink className="site-button site-primary">Помочь подобрать платье</AssistantLink></section>
    <section className="site-section site-about"><PhotoPlaceholder label="Место для фотографии шоурума MARIPOSA" /><div><h2>О MARIPOSA</h2><p>{brandStory}</p></div></section>
    <section className="site-section site-contacts" id="contacts"><div><h2>Контакты</h2><h3>Local · {contact.city}</h3><p>{contact.address}</p><p>{contact.hours}</p></div><ContactActions /></section>
  </div>;
}
