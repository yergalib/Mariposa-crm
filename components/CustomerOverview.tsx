import Link from "next/link";
import type { getCustomer } from "@/lib/customers/queries";

type Customer = NonNullable<Awaited<ReturnType<typeof getCustomer>>>;
export function CustomerOverview({ customer, canOrders, canCreate, canSell, financeAnchor }: {
  customer: Customer; canOrders: boolean; canCreate: boolean; canSell: boolean; financeAnchor: string | null;
}) {
  const active = customer.status === "ACTIVE";
  return <>
    <nav className="toolbar customer-profile-nav" aria-label="Разделы карточки клиента">
      <a href="#contacts">Контакты</a>{canOrders && <a href="#customer-orders">Заказы</a>}
      {financeAnchor && <a href={`#${financeAnchor}`}>Оплаты и расчёты</a>}
      <a href="#notes">Комментарии</a>{canOrders && <a href="#documents">Документы</a>}
    </nav>
    <section id="contacts" className="card customer-profile-contacts">
      <div className="section-heading"><h2>Связаться с клиентом</h2><Link href="/customers">Все клиенты</Link></div>
      {customer.contacts.length ? <ul>{customer.contacts.map(contact => {
        const phone = contact.type === "PHONE" ? contact.value.replace(/[^+\d]/g, "") : "";
        const href = phone ? `tel:${phone}` : contact.type === "EMAIL" ? `mailto:${encodeURIComponent(contact.value)}` : undefined;
        return <li key={contact.id}><span>{contact.type === "PHONE" ? "Телефон" : contact.type === "EMAIL" ? "Эл. почта" : "Контакт"}{contact.isPrimary ? " · основной" : ""}</span>
          {href ? <a href={href}>{contact.value}</a> : <b>{contact.value}</b>}{contact.label && <small>{contact.label}</small>}
        </li>;
      })}</ul> : <p>Контакты пока не указаны.</p>}
      {customer.addresses.map(address => <p key={address.id}>{[address.country, address.city, address.addressLine].filter(Boolean).join(", ")}{address.isPrimary ? " · основной адрес" : ""}</p>)}
      {active && <div className="toolbar">
        {canCreate && <Link className="button secondary" href={`/orders/new?customerId=${customer.id}`}>Новая аренда</Link>}
        {canSell && <Link className="button secondary" href={`/sales/new?customerId=${customer.id}`}>Новая продажа</Link>}
      </div>}
    </section>
  </>;
}
