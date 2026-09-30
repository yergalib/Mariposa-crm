import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { getOrder } from "@/lib/orders/queries";
import { createTenantContext } from "@/lib/tenant/context";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
import { PrintButton } from "@/components/PrintButton";
import "./print.css";

const outcomeLabels: Record<string, string> = { GOOD: "Хорошее", NEEDS_CLEANING: "Нужна чистка", DAMAGED: "Повреждено", LOST: "Утеряно" };
const date = (value: Date | null, zone: string) => value ? formatBusinessDateTime(value, zone) : "—";

export default async function PrintOrder({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRouteAccess("/orders");
  await requirePermission(session, "ORDER_VIEW");
  const { id } = await params;
  const order = await getOrder(createTenantContext(session.organizationId), id, { allowedBranchIds: session.hasOrganizationWideBranchAccess ? null : session.allowedBranchIds });
  if (!order || order.type !== "RENTAL") notFound();
  const generatedAt = new Date(), zone = order.branch.timezone;
  const customerName = [order.customer.firstName, order.customer.lastName, order.customer.middleName].filter(Boolean).join(" ");
  return <main className="order-print">
    <nav className="print-controls"><Link href={`/orders/${id}`}>← К заказу</Link><PrintButton /></nav>
    <header><div><strong>MARIPOSA</strong><h1>Рабочий лист выдачи и возврата</h1><p>Заказ {order.orderNumber} · {order.branch.name}</p></div><span className="print-draft">Черновик</span></header>
    <p className="print-notice">Данные на момент печати: {date(generatedAt, zone)}. Этот лист помогает сверить вещи и состояние. Подписанный акт и его неизменяемая версия пока не создаются.</p>
    <section className="print-facts">
      <div><small>Клиент</small><b>{customerName || "—"}</b><span>{order.customer.contacts.find(contact => contact.type === "PHONE")?.value ?? "Телефон не указан"}</span></div>
      <div><small>Период аренды</small><b>{date(order.rentalStartAt, zone)}</b><span>До {date(order.rentalEndAt, zone)}</span></div>
      <div><small>Филиал</small><b>{order.branch.name}</b><span>Заказ: {order.status}</span></div>
    </section>
    <h2>Вещи по заказу</h2>
    <table><thead><tr><th>Наименование / SKU</th><th>Заказано</th><th>Выдано</th><th>Возвращено</th><th>Состояние и примечания</th></tr></thead><tbody>
      {order.items.map(item => {
        const allocations = item.capacityAllocations.filter(allocation => allocation.sourceType === "ORDER");
        const issued = allocations.reduce((sum, allocation) => sum + allocation.issuedQuantity, 0);
        const returned = allocations.reduce((sum, allocation) => sum + allocation.returnedQuantity, 0);
        const serialized = allocations.flatMap(allocation => allocation.productInstance ? [allocation.productInstance.inventoryNumber] : []);
        const inspections = allocations.flatMap(allocation => [
          ...(allocation.returnInspectionResult ? [`${allocation.productInstance?.inventoryNumber ?? "Экземпляр"}: ${outcomeLabels[allocation.returnInspectionResult] ?? allocation.returnInspectionResult}${allocation.returnNote ? ` · ${allocation.returnNote}` : ""}`] : []),
          ...allocation.bulkPhysicalResolutions.filter(resolution => resolution.kind === "RETURN" || resolution.kind === "LOSS_RESOLUTION").flatMap(resolution => resolution.lines.map(line => `${outcomeLabels[line.outcome] ?? line.outcome}: ${line.quantity} шт.${line.note ? ` · ${line.note}` : ""}`))
        ]);
        return <tr key={item.id}><td><b>{item.productNameSnapshot} · {item.variantNameSnapshot}</b><small>{item.skuSnapshot}{serialized.length ? ` · № ${serialized.join(", ")}` : ""}</small></td><td>{item.quantity}</td><td>{issued}</td><td>{returned}</td><td>{inspections.length ? inspections.join("; ") : "Состояние не зафиксировано"}</td></tr>;
      })}
    </tbody></table>
    <section className="print-notes"><h2>Проверка перед передачей</h2><p>Фактическое количество и состояние: ____________________________________________________</p><p>Замечания: _____________________________________________________________________________</p></section>
    <footer><p>Рабочий лист сформирован из текущих данных CRM. Для юридического акта нужны утверждённый шаблон, нумерация, сохранённая версия и подписи.</p><span>{order.orderNumber} · {date(generatedAt, zone)}</span></footer>
  </main>;
}
