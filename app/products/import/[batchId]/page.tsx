import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { getProductSheetPreview } from "@/lib/catalog/product-sheet-import";
import type { ProductSheetRow } from "@/lib/catalog/product-sheet-parser";
import { confirmProductSheetAction } from "../actions";

export default async function ProductImportPreview({ params, searchParams }: { params: Promise<{ batchId: string }>; searchParams: Promise<{ error?: string }> }) {
  const session = await requireRouteAccess("/products");
  await requirePermission(session, "CATALOG_IMPORT");
  const { batchId } = await params, { error } = await searchParams;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(batchId)) notFound();
  const batch = await getProductSheetPreview(session.organizationId, session.userId, batchId);
  if (!batch) notFound();
  const rows = batch.rows as unknown as ProductSheetRow[], errors = batch.errors as string[];
  return <AppShell active="/products" title="Предпросмотр импорта" subtitle={`${batch.filename} · ${rows.length} строк · ${new Set(rows.map(row => row.internalCode)).size} товаров`}>
    {error && <p className="notice error">{error}</p>}
    {errors.length > 0 && <section className="card import-card"><h2>Ошибки ({errors.length})</h2><ul>{errors.slice(0, 30).map((item, i) => <li key={i}>{item}</li>)}</ul>{errors.length > 30 && <p>Показаны первые 30 ошибок.</p>}<p>Исправьте файл и загрузите его заново.</p></section>}
    <section className="card import-card"><h2>Новые варианты</h2>
      <div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Строка</th><th>Код</th><th>Название</th><th>Категория</th><th>Размер</th><th>SKU</th><th>Учёт</th></tr></thead><tbody>
        {rows.slice(0, 100).map(row => <tr key={row.line}><td>{row.line}</td><td>{row.internalCode}</td><td>{row.name}</td><td>{row.category || "—"}</td><td>{row.sizeSystem}/{row.sizeCode}</td><td>{row.sku}</td><td>{row.trackingMode}</td></tr>)}
      </tbody></table></div>
      {rows.length > 100 && <p>Показаны первые 100 строк из {rows.length}.</p>}
      {batch.status === "APPLIED" ? <p className="notice ok">Импорт уже завершён.</p> : errors.length === 0 && <form action={confirmProductSheetAction}><input type="hidden" name="batchId" value={batchId}/><button className="primary">Создать черновики товаров</button></form>}
    </section>
  </AppShell>;
}
