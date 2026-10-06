import Link from "next/link";
import type { AuthContext } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";
import { documentsNotInstalled, listCustomerRentalDocuments, RentalDocumentError } from "@/lib/orders/documents";

export async function CustomerDocuments({ session, customerId, after }: {
  session: AuthContext; customerId: string; after?: string;
}) {
  if (!await hasPermission(session, "CUSTOMER_VIEW") || !await hasPermission(session, "ORDER_VIEW")) return null;
  let result;
  try { result = await listCustomerRentalDocuments(session, customerId, after); }
  catch (error) {
    if (!documentsNotInstalled(error) && !(error instanceof RentalDocumentError)) throw error;
    return <section className="card" id="documents"><h2>Документы</h2>
      <p>{documentsNotInstalled(error) ? "Сохранённые документы пока недоступны." : "Страница документов недоступна."}</p>
      {after !== undefined && <Link href={`/customers/${customerId}#documents`}>К началу списка</Link>}
    </section>;
  }
  if (!result) return null;
  return <section className="card" id="documents"><h2>Документы</h2>
    <p>Сохранённые неподписанные версии документов аренды по доступным заказам и филиалам.</p>
    {result.versions.length === 0 ? <p>Сохранённых документов пока нет.</p> : <ul>
      {result.versions.map(version => <li key={version.id}>
        <Link href={`/orders/${version.orderId}/documents/${version.id}`}>
          {version.order.orderNumber} · Версия {version.version} · просмотр и печать
        </Link>{" — "}{formatBusinessDateTime(version.createdAt, version.branch.timezone)} · {version.branch.name} · Не подписан
      </li>)}
    </ul>}
    {(after !== undefined || result.nextCursor) && <nav aria-label="Страницы документов">
      {after !== undefined && <Link href={`/customers/${customerId}#documents`}>К началу списка</Link>}{" "}
      {result.nextCursor && <Link href={`/customers/${customerId}?documentsAfter=${result.nextCursor}#documents`}>Следующие документы →</Link>}
    </nav>}
  </section>;
}
