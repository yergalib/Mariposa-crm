import Link from "next/link";
import { InquiryDraft } from "./InquiryDraft";
import { showroomContact as contact } from "./site-content";
export function Fitting() {
  return <section className="fitting-page"><Link className="catalog-back" href="/showroom?view=catalog">← К каталогу</Link><h1>Примерка в MARIPOSA</h1><p>Можно сначала выбрать платье или обсудить пожелания с сотрудником.</p><p>{contact.name} · {contact.city} · {contact.hours}</p><InquiryDraft /><Link className="site-button" href="/showroom?view=catalog">Выбрать платье для примерки</Link></section>;
}
