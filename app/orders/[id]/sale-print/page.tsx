import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { getSalePrint, saleIssuedQuantity } from "@/lib/sales/print";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
import { orderStatusLabel } from "@/lib/ui/labels";
import { PrintButton } from "@/components/PrintButton";
import "../print/print.css";
import "./sale-print.css";

export default async function SalePrint({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRouteAccess("/orders");
  await requirePermission(session, "ORDER_VIEW");
  const { id } = await params;
  const order = await getSalePrint(session, id);
  if (!order) notFound();
  const generatedAt = formatBusinessDateTime(new Date(), order.branch.timezone);
  return <main className="order-print sale-print">
    <nav className="print-controls"><Link href={`/orders/${id}`}>К продаже</Link><PrintButton /></nav>
    <header><div><strong>MARIPOSA</strong><h1>Технический лист передачи продажи</h1><p>{order.orderNumber} · {order.branch.name}</p></div><span className="print-draft">Не подписан</span></header>
    <p className="print-notice">Текущие данные CRM на {generatedAt}. Это оперативный лист, а не сохранённая неизменяемая версия. Повторная печать может отличаться после изменения данных.</p>
    <section className="print-facts"><div><small>Клиент</small><b>{[order.customer.lastName, order.customer.firstName, order.customer.middleName].filter(Boolean).join(" ") || "Не указан"}</b></div><div><small>Филиал</small><b>{order.branch.name}</b></div><div><small>Статус заказа</small><b>{orderStatusLabel(order.status)}</b></div></section>
    <table><thead><tr><th>Товар / SKU</th><th>Заказано</th><th>Передано</th><th>Осталось передать</th><th>Факты передачи</th></tr></thead><tbody>{order.items.map(item => {
      const issued = saleIssuedQuantity(item.saleInventoryCommitments);
      const facts = item.saleInventoryCommitments.flatMap(commitment => commitment.inventoryMovements.map((movement, index) => <div key={`${commitment.id}:${index}`}>{-movement.quantity} шт. · {formatBusinessDateTime(movement.occurredAt, order.branch.timezone)}{commitment.productInstance && <small>Экземпляр: {commitment.productInstance.inventoryNumber} · штрихкод: {commitment.productInstance.barcode || "не указан"}</small>}</div>));
      return <tr key={item.id}><td><b>{item.productNameSnapshot}</b><small>{item.variantNameSnapshot} · {item.skuSnapshot}</small>{item.removedAt && <small>Позиция удалена из заказа; факты сохранены</small>}</td><td>{item.quantity}</td><td>{issued}</td><td>{item.removedAt ? "Не применяется" : Math.max(0, item.quantity - issued)}</td><td>{facts.length ? facts : "Передача не зафиксирована"}{issued > item.quantity && <small>Передано больше заказанного — требуется проверка</small>}</td></tr>;
    })}</tbody></table>
    <footer><p>Количества передачи подтверждаются складскими движениями SALE_ISSUE. Лист не выполняет передачу, не подтверждает оплату и не является подписанным актом или фискальным чеком.</p><span>{order.orderNumber}</span></footer>
  </main>;
}
