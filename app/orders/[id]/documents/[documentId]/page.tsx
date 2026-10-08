import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRouteAccess } from "@/lib/auth/session";
import { documentsNotInstalled, getRentalDocument } from "@/lib/orders/documents";
import { readRentalSnapshot } from "@/lib/orders/document-snapshot";
import { RentalDocumentV3 } from "@/components/RentalDocumentV3";
import { RentalDocumentV2 } from "@/components/RentalDocumentV2";
import { RentalDocumentV1 } from "@/components/RentalDocumentV1";
import { PrintButton } from "@/components/PrintButton";
import "../../print/print.css";

export default async function SavedRentalDocument({ params }: { params: Promise<{ id: string; documentId: string }> }) {
  const session = await requireRouteAccess("/orders");
  const { id, documentId } = await params;
  let document;
  try { document = await getRentalDocument(session, id, documentId); }
  catch (error) {
    if (!documentsNotInstalled(error)) throw error;
    return <main className="order-print"><p>Сохранённые документы пока недоступны. Требуется согласованное обновление базы данных.</p><Link href={`/orders/${id}`}>К заказу</Link></main>;
  }
  if (!document) notFound();
  let snapshot;
  try { snapshot = readRentalSnapshot(document.snapshot, document.contentHash, document.schemaVersion, document.templateVersion); }
  catch {
    return <main className="order-print"><p role="alert">Не удалось проверить сохранённую версию или её шаблон. Печать недоступна; обратитесь к администратору.</p><Link href={`/orders/${id}/documents`}>К версиям</Link></main>;
  }
  return <main className="order-print">
    <nav className="print-controls"><Link href={`/orders/${id}/documents`}>← К версиям</Link><PrintButton /></nav>
    {snapshot.templateVersion === 3 ? <RentalDocumentV3 snapshot={snapshot} version={document.version} reason={document.revisionReason} /> : snapshot.templateVersion === 2 ? <RentalDocumentV2 snapshot={snapshot} version={document.version} reason={document.revisionReason} /> : <RentalDocumentV1 snapshot={snapshot} version={document.version} reason={document.revisionReason} />}
  </main>;
}
