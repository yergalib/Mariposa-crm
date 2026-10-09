import { HeroCarousel } from "./HeroCarousel";
import { heroSlides } from "./hero-slides";
import { colorPhotoCards, type ColorPhotoCard } from "@/lib/showroom/color-cards";
import Link from "next/link";
import type { PublicBrowseCard } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { PhotoPlaceholder } from "./ShowroomPresentation";
import { ProductPhoto } from "./ProductPhoto";
import { HomeProductCard } from "./HomeProductCard";
import { AssistantLink } from "./AssistantLink";
import { ContactActions } from "./SiteChrome";
import { brandStory, rentalSteps, showroomContact as contact } from "./site-content";

export function ShowroomHome({ items, colorCards, catalogUnavailable = false }: { items: PublicBrowseCard[]; colorCards?: ColorPhotoCard[]; catalogUnavailable?: boolean }) {
  const colors = colorCards ?? colorPhotoCards(items);
  // Never pad the home showcase with missing photographs. The full catalogue remains accessible.
  const photographed = items.filter(item => item.images?.length).slice(0, 4);
  return <div className="showroom-home">
    <section className="site-hero">
      <div className="site-hero-copy"><span className="site-eyebrow">MARIPOSA · Астана</span><h1>Найдите идеальное платье для вашего праздника</h1><p>Детские и подростковые праздничные платья в аренду.</p><div className="site-actions"><Link className="site-button site-primary" href="/showroom?view=catalog">Смотреть каталог</Link><AssistantLink className="site-text-link">Помочь с выбором <span aria-hidden="true">↗</span></AssistantLink></div></div>
      <HeroCarousel slides={heroSlides} fallback={<PhotoPlaceholder label="Место для реальной фотографии MARIPOSA" />} />
    </section>
    <section className="site-section"><div className="site-section-heading"><h2>Платья из каталога</h2><Link href="/showroom?view=catalog">Смотреть все <span aria-hidden="true">→</span></Link></div>
      {photographed.length ? <div className="showroom-items site-home-products">{photographed.map(item => <HomeProductCard key={item.id} item={item} />)}</div> : <p className="site-muted">{catalogUnavailable ? "Каталог временно недоступен. Можно связаться с шоурумом." : "Фотографии готовятся. Платья и размеры можно посмотреть в каталоге."}</p>}
    </section>
    {colors.length > 0 && <section className="site-section"><div className="site-section-heading"><h2>Выберите цвет</h2><Link href="/showroom?view=catalog">Все цвета и фильтры каталога <span aria-hidden="true">→</span></Link></div><div className="site-color-photos">{colors.map(group => <Link key={group.id} href={browseHref({ search: "", categoryId: "", page: 1, colorGroup: group.id })}><ProductPhoto key={group.photo.id} photo={group.photo} /><span>{group.label}</span></Link>)}</div></section>}
    <section className="site-section site-benefits" aria-labelledby="rental-benefit-title"><h2 id="rental-benefit-title">Праздничный образ без покупки</h2><p>Подберите платье, обувь и аксессуары в одном месте. После праздника верните наряд</p></section>
    <section className="site-section" id="rental"><h2>Как работает аренда</h2><ol className="site-steps">{rentalSteps.map((step, i) => <li key={step}><span>0{i + 1}</span><h3>{i === 1 ? <Link href="/showroom?view=fitting">{step}</Link> : step}</h3></li>)}</ol></section>
    <section className="site-assistant"><div><h2>Выбираем ваше платье</h2><p>Сохраните понравившиеся варианты в избранное и обсудите выбор с сотрудником.</p></div><AssistantLink className="site-button">Помочь с выбором</AssistantLink></section>
    <section className="site-section site-about site-about-text"><h2>О MARIPOSA</h2><p>{brandStory}</p></section>
    <section className="site-section site-contacts" id="contacts"><div><h2>Контакты</h2><h3>Local · {contact.city}</h3><p>{contact.address}</p><p>{contact.hours}</p></div><ContactActions /></section>
  </div>;
}
