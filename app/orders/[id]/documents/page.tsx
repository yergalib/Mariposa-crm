import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { documentsNotInstalled, listRentalDocuments } from "@/lib/orders/documents";
import { SaveDocumentForm } from "./SaveDocumentForm";
import "./documents.css";

export default async function RentalDocuments({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRouteAccess("/orders");
  const { id } = await params;
  let result;
  try { result = await listRentalDocuments(session, id); }
  catch (error) {
    if (!documentsNotInstalled(error)) throw error;
    return <AppShell active="/orders" title="Документы аренды" subtitle="Сохранённые версии">
      <section className="card"><p>Сохранение документов пока не включено. Требуется согласованное обновление базы данных.</p><Link href={`/orders/${id}`}>К заказу</Link></section>
    </AppShell>;
  }
  if (!result) notFound();
  const canSave = await hasPermission(session, "ORDER_EDIT");
  return <AppShell active="/orders" title={`Документы · ${result.orderNumber}`} subtitle="Сохранённые неподписанные версии">
    <div className="rental-documents">
      <section className="card">
        <Link href={`/orders/${id}`}>← К заказу</Link>
        <h2>Документ аренды</h2>
        <p>Сохраняет данные заказа, выдачи и возврата на текущий момент. Это не подписанный и не юридически проверенный акт. Сохранение документа не выдаёт вещи и не меняет заказ.</p>
        <p>Предыдущие версии сохраняются. Телефон, финансовые поля и внутренние комментарии в документ не включаются. Примечания осмотра вещей будут видны при печати.</p>
        {canSave ? <SaveDocumentForm orderId={id} baseVersion={result.versions[0]?.version ?? 0} idempotencyKey={randomUUID()} />
          : <p>Для сохранения версии требуется право редактирования заказа.</p>}
      </section>
      <section className="card">
        <h2>Сохранённые версии</h2>
        {!result.versions.length ? <p>Версий пока нет.</p> : <ol className="rental-document-list">{result.versions.map(version => <li key={version.id}>
          <Link href={`/orders/${id}/documents/${version.id}`}>Версия {version.version} · просмотр и печать</Link>
          <time dateTime={version.createdAt.toISOString()}>{version.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC</time>
          <p>{version.revisionReason ?? "Первое сохранение"} · Не подписан</p>
        </li>)}</ol>}
        {result.versions.length === 100 && <p>Показаны последние 100 версий. Ранее сохранённые документы доступны по своим ссылкам.</p>}
      </section>
    </div>
  </AppShell>;
}
