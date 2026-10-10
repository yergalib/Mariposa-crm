import { ContactActions } from "./SiteChrome";
import { showroomContact as contact } from "./site-content";
export function Contacts() {
  return <section className="contacts-page"><h1>Контакты</h1><div className="contact-details"><div><h2>Шоурум {contact.name} · {contact.city}</h2><address>{contact.address}</address><p>{contact.hours}</p><p>WhatsApp: +7 778 527 48 82</p><ContactActions /></div></div></section>;
}
