import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { getEffectivePermissions } from "@/lib/permissions/effective";
import { listSuppliers } from "@/lib/purchases/queries";
import {
  archiveSupplierAction,
  createSupplierAction,
  updateSupplierAction,
} from "../actions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const s = await requireRouteAccess("/purchases/suppliers"),
    [rows, p, permissions] = await Promise.all([
      listSuppliers(createTenantContext(s.organizationId), s),
      searchParams,
      getEffectivePermissions(s),
    ]),
    manage = permissions.has("SUPPLIER_MANAGE");
  return (
    <AppShell
      active="/purchases"
      title="Поставщики"
      subtitle="Архивирование сохраняет историю закупок"
    >
      {(p.ok || p.error) && (
        <p className={p.error ? "notice error" : "notice ok"}>
          {p.error || p.ok}
        </p>
      )}
      {manage && (
        <section className="card">
          <h2>Новый поставщик</h2>
          <form action={createSupplierAction} className="purchase-form-grid">
            <label>
              Название
              <input name="name" maxLength={200} required />
            </label>
            <label>
              Контактное лицо
              <input name="contactName" maxLength={160} />
            </label>
            <label>
              Телефон
              <input name="phone" maxLength={50} />
            </label>
            <label>
              Email
              <input name="email" type="email" maxLength={254} />
            </label>
            <label>
              Адрес
              <input name="address" maxLength={500} />
            </label>
            <label>
              Заметки
              <input name="notes" maxLength={1000} />
            </label>
            <button className="primary">Создать</button>
          </form>
        </section>
      )}
      <section className="card">
        <h2>Список поставщиков</h2>
        {rows.map((x) => (
          <details key={x.id}>
            <summary className="supplier-row">
              <span>
                <b>{x.name}</b>
                <small>{x.contactName || "Контакт не указан"}</small>
              </span>
              <span>{x.phone || x.email || "—"}</span>
              <span>{x.status === "ACTIVE" ? "Активен" : "В архиве"}</span>
              <span>{x._count.purchases} закупок</span>
            </summary>
            {manage && x.status === "ACTIVE" && (
              <div className="card">
                <form
                  action={updateSupplierAction}
                  className="purchase-form-grid"
                >
                  <input type="hidden" name="supplierId" value={x.id} />
                  <label>
                    Название
                    <input name="name" defaultValue={x.name} required />
                  </label>
                  <label>
                    Контактное лицо
                    <input
                      name="contactName"
                      defaultValue={x.contactName ?? ""}
                    />
                  </label>
                  <label>
                    Телефон
                    <input name="phone" defaultValue={x.phone ?? ""} />
                  </label>
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      defaultValue={x.email ?? ""}
                    />
                  </label>
                  <label>
                    Адрес
                    <input name="address" defaultValue={x.address ?? ""} />
                  </label>
                  <label>
                    Заметки
                    <input name="notes" defaultValue={x.notes ?? ""} />
                  </label>
                  <button className="secondary">Сохранить</button>
                  <button className="danger" formAction={archiveSupplierAction}>
                    Архивировать
                  </button>
                </form>
              </div>
            )}
          </details>
        ))}
        {!rows.length && <p>Поставщиков пока нет.</p>}
      </section>
    </AppShell>
  );
}
