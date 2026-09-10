import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { getEffectivePermissions } from "@/lib/permissions/effective";
import { getPurchase, getPurchaseOptions } from "@/lib/purchases/queries";
import {
  addPurchaseItemAction,
  cancelPurchaseAction,
  confirmPurchaseAction,
  removePurchaseItemAction,
  updatePurchaseAction,
  updatePurchaseItemAction,
  receivePurchaseItemAction,
  closePurchaseAction,
} from "../actions";
const labels = {
  DRAFT: "Черновик",
  CONFIRMED: "Подтверждена",
  PARTIALLY_RECEIVED: "Получена частично",
  RECEIVED: "Получена",
  CLOSED: "Завершена",
  CANCELLED: "Отменена",
} as const;
const money = (v: bigint | null | undefined, c: string) =>
  v == null
    ? "Скрыто"
    : new Intl.NumberFormat("ru-KZ", {
        style: "currency",
        currency: c,
        maximumFractionDigits: 0,
      }).format(Number(v));
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const s = await requireRouteAccess("/purchases/x"),
    { id } = await params,
    t = createTenantContext(s.organizationId);
  let purchase;
  try {
    purchase = await getPurchase(t, id, s);
  } catch {
    return notFound();
  }
  const [p, permissions] = await Promise.all([
      searchParams,
      getEffectivePermissions(s),
    ]),
    edit =
      purchase.status === "DRAFT" &&
      purchase.costVisible &&
      permissions.has("PURCHASE_EDIT"),
    receive =
      ["CONFIRMED", "PARTIALLY_RECEIVED"].includes(purchase.status) &&
      permissions.has("PURCHASE_RECEIVE"),
    options = edit || receive ? await getPurchaseOptions(t, s) : null,
    locations = options?.branches.find((branch) => branch.id === purchase.destinationBranchId)?.locations ?? [];
  return (
    <AppShell
      active="/purchases"
      title={`Закупка ${purchase.purchaseNumber}`}
      subtitle={`${purchase.supplier.name} · ${labels[purchase.status]}`}
    >
      {(p.ok || p.error) && (
        <p className={p.error ? "notice error" : "notice ok"}>
          {p.error || p.ok}
        </p>
      )}
      <section className="card purchase-meta">
        <div className="purchase-form-grid">
          <div>
            <small>Поставщик</small>
            <b>{purchase.supplier.name}</b>
          </div>
          <div>
            <small>Филиал назначения</small>
            <b>{purchase.destinationBranch.name}</b>
          </div>
          <div>
            <small>Статус</small>
            <b>{labels[purchase.status]}</b>
          </div>
          <div>
            <small>Внешний номер</small>
            <b>{purchase.externalReference || "—"}</b>
          </div>
        </div>
        {edit && options && (
          <form action={updatePurchaseAction} className="purchase-form">
            <input type="hidden" name="purchaseId" value={id} />
            <input type="hidden" name="version" value={purchase.version} />
            <div className="purchase-form-grid">
              <label>
                Поставщик
                <select name="supplierId" defaultValue={purchase.supplierId}>
                  {options.suppliers.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Филиал
                <select
                  name="destinationBranchId"
                  defaultValue={purchase.destinationBranchId}
                >
                  {options.branches.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Валюта
                <input name="currency" defaultValue={purchase.currency} />
              </label>
              <label>
                Дополнительные расходы
                <input
                  name="additionalCostMinor"
                  type="number"
                  min="0"
                  defaultValue={purchase.additionalCostMinor?.toString()}
                />
              </label>
              <label>
                Внешний номер
                <input
                  name="externalReference"
                  defaultValue={purchase.externalReference ?? ""}
                />
              </label>
              <label>
                Примечание
                <input name="note" defaultValue={purchase.note ?? ""} />
              </label>
            </div>
            <button className="secondary">Сохранить реквизиты</button>
          </form>
        )}
      </section>
      <section className="card">
        <h2>Позиции</h2>
        {purchase.items.map((x) => {
          const received = x.receiptLines.reduce((sum, line) => sum + line.quantity, 0),
            remaining = x.orderedQuantity - received;
          return (
          edit && options ? (
            <form
              action={updatePurchaseItemAction}
              className="purchase-item-form"
              key={x.id}
            >
              <input type="hidden" name="purchaseId" value={id} />
              <input type="hidden" name="purchaseItemId" value={x.id} />
              <label>
                Товар
                <select
                  name="productVariantId"
                  defaultValue={x.productVariantId}
                >
                  {options.variants.map((v) => (
                    <option value={v.id} key={v.id}>
                      {v.product.name} · {v.size.name || v.size.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Количество
                <input
                  name="orderedQuantity"
                  type="number"
                  min="1"
                  defaultValue={x.orderedQuantity}
                />
              </label>
              <label>
                Цена
                <input
                  name="unitCostMinor"
                  type="number"
                  min="0"
                  defaultValue={x.unitCostMinor?.toString()}
                />
              </label>
              <label>
                Скидка
                <input
                  name="lineDiscountMinor"
                  type="number"
                  min="0"
                  defaultValue={x.lineDiscountMinor?.toString()}
                />
              </label>
              <label>
                Комментарий
                <input name="itemNote" defaultValue={x.note ?? ""} />
              </label>
              <span>
                <button className="secondary">Сохранить</button>
                <button
                  className="danger"
                  formAction={removePurchaseItemAction}
                >
                  Удалить
                </button>
              </span>
            </form>
          ) : (
            <div className="purchase-receipt-item" key={x.id}>
              <div className="purchase-item-form">
              <span>
                <b>{x.productNameSnapshot}</b>
                <small>
                  {x.variantNameSnapshot} · {x.skuSnapshot}
                </small>
              </span>
              <span>Заказано: {x.orderedQuantity} шт.</span>
              <span>Получено: {received} шт.</span>
              <span>Осталось: {remaining} шт.</span>
              <span>{money(x.unitCostMinor, purchase.currency)}</span>
              <span>
                Скидка: {money(x.lineDiscountMinor, purchase.currency)}
              </span>
              <span>
                Доставка:{" "}
                {money(x.allocatedAdditionalCostMinor, purchase.currency)}
              </span>
              <b>{money(x.lineTotalMinor, purchase.currency)}</b>
              </div>
              {x.receiptLines.length > 0 && (
                <div className="purchase-receipt-history">
                  {x.receiptLines.map((line) => (
                    <small key={line.id}>
                      {line.purchaseReceipt.receiptNumber} · {line.quantity} шт. · {line.purchaseReceipt.location.name} · {line.purchaseReceipt.receivedAt.toLocaleDateString("ru-KZ")}
                      {purchase.costVisible && "totalAcquisitionCostMinor" in line ? ` · ${money(line.totalAcquisitionCostMinor, purchase.currency)}` : ""}
                    </small>
                  ))}
                </div>
              )}
              {receive && remaining > 0 && locations.length > 0 && (
                <form action={receivePurchaseItemAction} className="purchase-receipt-form">
                  <input type="hidden" name="purchaseId" value={id} />
                  <input type="hidden" name="purchaseItemId" value={x.id} />
                  <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                  <label>Количество<input name="quantity" type="number" min="1" max={remaining} defaultValue={remaining} required /></label>
                  <label>Локация<select name="locationId" required>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label>
                  <label>Дата прихода<input name="receivedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
                  <label>Комментарий<input name="receiptNote" maxLength={1000} /></label>
                  <button className="primary">Принять на склад</button>
                </form>
              )}
            </div>
          ));
        })}
        {edit && options && (
          <form action={addPurchaseItemAction} className="purchase-item-form">
            <input type="hidden" name="purchaseId" value={id} />
            <label>
              Добавить товар
              <select name="productVariantId" required>
                <option value="">Выберите</option>
                {options.variants.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.product.name} · {v.size.name || v.size.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Количество
              <input name="orderedQuantity" type="number" min="1" required />
            </label>
            <label>
              Цена
              <input name="unitCostMinor" type="number" min="0" required />
            </label>
            <label>
              Скидка
              <input
                name="lineDiscountMinor"
                type="number"
                min="0"
                defaultValue="0"
              />
            </label>
            <label>
              Комментарий
              <input name="itemNote" />
            </label>
            <button className="primary">Добавить</button>
          </form>
        )}
      </section>
      {purchase.costVisible && (
        <section className="card purchase-totals">
          <div>
            <small>Сумма позиций</small>
            <b>{money(purchase.subtotalMinor, purchase.currency)}</b>
          </div>
          <div>
            <small>Скидки</small>
            <b>{money(purchase.lineDiscountTotalMinor, purchase.currency)}</b>
          </div>
          <div>
            <small>Доставка и расходы</small>
            <b>{money(purchase.additionalCostMinor, purchase.currency)}</b>
          </div>
          <div>
            <small>Итого закупка</small>
            <b>{money(purchase.totalMinor, purchase.currency)}</b>
          </div>
        </section>
      )}
      <div className="purchase-links">
        {purchase.status === "DRAFT" && permissions.has("PURCHASE_EDIT") && (
          <form action={confirmPurchaseAction}>
            <input type="hidden" name="purchaseId" value={id} />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <button className="primary">Подтвердить закупку</button>
          </form>
        )}
        {["DRAFT", "CONFIRMED"].includes(purchase.status) &&
          permissions.has("PURCHASE_CANCEL") && (
            <form action={cancelPurchaseAction}>
              <input type="hidden" name="purchaseId" value={id} />
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <button className="danger">Отменить закупку</button>
            </form>
          )}
      </div>
      {purchase.status === "PARTIALLY_RECEIVED" && permissions.has("PURCHASE_EDIT") && (
        <form action={closePurchaseAction} className="card purchase-form">
          <input type="hidden" name="purchaseId" value={id} />
          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
          <label>Причина завершения частичной поставки<input name="reason" maxLength={1000} required /></label>
          <button className="secondary">Завершить поставку</button>
        </form>
      )}
      {["CONFIRMED", "PARTIALLY_RECEIVED"].includes(purchase.status) && (
        <p className="notice ok">
          Коммерческие данные зафиксированы. Приёмка изменяет склад только после подтверждения формы.
        </p>
      )}
    </AppShell>
  );
}
