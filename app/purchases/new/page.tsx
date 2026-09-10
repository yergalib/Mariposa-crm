import { randomUUID } from "node:crypto";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { createTenantContext } from "@/lib/tenant/context";
import { getPurchaseOptions } from "@/lib/purchases/queries";
import { createPurchaseAction } from "../actions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const s = await requireRouteAccess("/purchases/new");
  await requirePermission(s, "PURCHASE_CREATE");
  await requirePermission(s, "FINANCE_PURCHASE_COST_VIEW");
  const [o, p] = await Promise.all([
    getPurchaseOptions(createTenantContext(s.organizationId), s),
    searchParams,
  ]);
  return (
    <AppShell
      active="/purchases"
      title="Новая закупка"
      subtitle="Создаётся коммерческий черновик без изменения склада"
    >
      {p.error && <p className="notice error">{p.error}</p>}
      <section className="card">
        <form action={createPurchaseAction} className="purchase-form">
          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
          <div className="purchase-form-grid">
            <label>
              Поставщик
              <select name="supplierId" required>
                <option value="">Выберите поставщика</option>
                {o.suppliers.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Филиал назначения
              <select name="destinationBranchId" required>
                <option value="">Выберите филиал</option>
                {o.branches.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Валюта
              <input
                name="currency"
                defaultValue={o.defaultCurrency}
                pattern="[A-Za-z]{3}"
                required
              />
            </label>
            <label>
              Дополнительные расходы
              <input
                name="additionalCostMinor"
                type="number"
                min="0"
                defaultValue="0"
                required
              />
            </label>
            <label>
              Внешний номер
              <input name="externalReference" maxLength={120} />
            </label>
            <label>
              Примечание
              <input name="note" maxLength={1000} />
            </label>
          </div>
          <h2>Первая позиция</h2>
          <div className="purchase-form-grid">
            <label>
              Товар / вариант
              <select name="productVariantId" required>
                <option value="">Выберите вариант</option>
                {o.variants.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.product.name} · {x.size.name || x.size.code} · {x.sku}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Количество
              <input name="orderedQuantity" type="number" min="1" required />
            </label>
            <label>
              Цена за единицу
              <input name="unitCostMinor" type="number" min="0" required />
            </label>
            <label>
              Скидка строки
              <input
                name="lineDiscountMinor"
                type="number"
                min="0"
                defaultValue="0"
                required
              />
            </label>
            <label>
              Комментарий позиции
              <input name="itemNote" maxLength={500} />
            </label>
          </div>
          <button className="primary">Создать черновик</button>
        </form>
      </section>
    </AppShell>
  );
}
