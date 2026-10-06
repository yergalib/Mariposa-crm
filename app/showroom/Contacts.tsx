import { ContactActions } from "./SiteChrome";
import { showroomContact as contact } from "./site-content";
import { PhotoPlaceholder } from "./ShowroomPresentation";
export function Contacts() {
  return <section className="contacts-page"><h1>Контакты</h1><p>Выберите удобный способ связаться с MARIPOSA.</p><div className="site-about"><div><h2>Шоурум {contact.name} · {contact.city}</h2><address>{contact.address}</address><p>{contact.hours}</p><p>WhatsApp: +7 778 527 48 82</p><ContactActions /></div><PhotoPlaceholder label="Место для фотографии шоурума Local" /></div><a className="site-map-link" href={contact.map} target="_blank" rel="noopener noreferrer"><span>Local · Астана</span><strong>Открыть карту и построить маршрут в 2GIS ↗</strong></a></section>;
}
