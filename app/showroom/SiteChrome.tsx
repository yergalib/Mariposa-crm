import Image from "next/image";
import Link from "next/link";
import { FavoritesLink } from "./FavoriteButton";
import { AssistantLink } from "./AssistantLink";
import { showroomContact as contact } from "./site-content";
import { MobileMenu } from "./MobileMenu";

function Navigation() {
  return <><Link href="/showroom?view=catalog">Каталог</Link><AssistantLink>Подобрать платье</AssistantLink><Link href="/showroom#rental">Как работает аренда</Link><Link href="/showroom?view=fitting">Примерка</Link><Link href="/showroom?view=contacts">Контакты</Link></>;
}
export function ContactActions() {
  return <div className="site-actions contact-actions"><a className="site-button" href={contact.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a><a className="site-text-link" href={contact.instagram} target="_blank" rel="noopener noreferrer">Instagram</a><a className="site-text-link" href={contact.map} target="_blank" rel="noopener noreferrer">Построить маршрут</a></div>;
}
export function SiteHeader() {
  return <><a href="#showroom-content" className="site-skip">К содержимому</a><header className="site-header">
    <Link className="site-brand" href="/showroom" aria-label="MARIPOSA — главная"><Image src="/brand/mariposa-logo.png" alt="MARIPOSA" width={1712} height={666} unoptimized priority /></Link>
    <nav className="site-desktop-nav" aria-label="Основная навигация"><Navigation /><FavoritesLink /></nav><Link className="site-city" href="/showroom?view=contacts">Астана</Link>
    <MobileMenu><Navigation /><FavoritesLink /></MobileMenu>
  </header></>;
}
export function SiteFooter() {
  return <footer className="site-footer"><div><Link className="site-brand" href="/showroom"><Image src="/brand/mariposa-logo.png" alt="MARIPOSA" width={1712} height={666} unoptimized /></Link><p>Платья для особенных дней</p></div>
    <nav aria-label="Навигация внизу страницы"><Navigation /><FavoritesLink /></nav>
    <div><h2>Шоурум Local · {contact.city}</h2><p>{contact.address}</p><p>{contact.hours}</p><ContactActions /></div>
    <p className="site-footer-note">Бронь действует после подтверждения сотрудником.</p>
  </footer>;
}
