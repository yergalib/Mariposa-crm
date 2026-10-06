import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { uploadProductSheetAction } from "./actions";

export default async function ProductImportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireRouteAccess("/products");
  await requirePermission(session, "CATALOG_IMPORT");
  const { error } = await searchParams;
  return <AppShell active="/products" title="Импорт новых товаров" subtitle="Шаблон XLSX · проверка перед созданием">
    {error && <p className="notice error">{error}</p>}
    <section className="card import-card">
      <h2>1. Заполните шаблон</h2>
      <p>Одна строка — один размер нового товара. Укажите существующую категорию и размер из настроек CRM. Если SKU пуст, он создаётся из кода товара и размера. До 500 строк и 2 МБ.</p>
      <p>Импорт создаёт черновики без цен и остатков. Повторяйте код товара для нескольких размеров; название и остальные сведения о модели должны совпадать.</p>
      <Link prefetch={false} className="secondary button-link" href="/products/import/template">↓ Скачать шаблон</Link>
    </section>
    <section className="card import-card">
      <h2>2. Проверьте файл</h2>
      <form action={uploadProductSheetAction} className="inline-form">
        <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        <button className="primary">Показать предпросмотр</button>
      </form>
    </section>
  </AppShell>;
}
