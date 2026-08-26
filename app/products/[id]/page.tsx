import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BarcodeClient } from "@/components/BarcodeClient";
import { getCatalogProductById, type MoneyDto } from "@/lib/catalog/queries";
import { requireRouteAccess } from "@/lib/auth/session";
import { CONDITION_LABELS, INSTANCE_STATUS_LABELS } from "@/lib/inventory/labels";
import { createTenantContext } from "@/lib/tenant/context";

function formatMoney(money: MoneyDto | null) {
  return money ? `${money.amountMinor.toLocaleString("ru-KZ")} ${money.currency}` : "—";
}

export default async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRouteAccess("/products");
  const { id } = await params;
  const tenant = createTenantContext(session.organizationId);
  const product = await getCatalogProductById({
    tenant,
    defaultBranchId: session.defaultBranchId,
    productId: id
  });

  if (!product) notFound();

  return (
    <AppShell
      active="/products"
      title={product.name}
      subtitle={`Код ${product.internalCode}${product.color ? ` · ${product.color}` : ""}`}
      action={<button className="secondary" disabled title="Редактирование будет подключено отдельным этапом">Редактировать</button>}
    >
      <section className="product-hero">
        <div className="hero-photo"><span>MARIPOSA</span><small>Фото из storage пока не подключено</small></div>
        <div className="hero-info">
          <span className="eyebrow">{product.categoryName ?? "Без категории"}</span>
          <h2>{product.name}</h2>
          <p>{product.description ?? "Описание не добавлено."}</p>
          <div className="meta-grid">
            <div><small>Внутренний код</small><b>{product.internalCode}</b></div>
            <div><small>Модель поставщика</small><b>{product.supplierModel ?? "—"}</b></div>
            <div><small>Размеров</small><b>{product.variants.length}</b></div>
            <div><small>Учёт</small><b>Поэкземплярный</b></div>
          </div>
        </div>
      </section>

      <section className="card variants-card">
        <div className="card-head"><div><h2>Размеры и остатки</h2><p>Физический статус не учитывает будущую календарную доступность</p></div></div>
        <div className="variant-table">
          <div className="variant-row database-variant header"><span>Размер / SKU</span><span>Аренда</span><span>Продажа</span><span>Всего</span><span>Доступно</span><span>В аренде</span><span>Обслуживание</span></div>
          {product.variants.map((variant) => {
            const count = (status: string) => variant.instances.filter((item) => item.operationalStatus === status).length;
            const serviceCount = count("CLEANING") + count("REPAIR") + count("RETURN_INSPECTION");
            return (
              <details key={variant.id} className="variant-details">
                <summary className="variant-row database-variant">
                  <span><b>{variant.size}</b><small>{variant.sku}</small></span>
                  <span>{formatMoney(variant.rentalPrice)}</span>
                  <span>{formatMoney(variant.salePrice)}</span>
                  <span>{variant.instances.length}</span>
                  <span>{count("AVAILABLE")}</span>
                  <span>{count("RENTED")}</span>
                  <span>{serviceCount}</span>
                </summary>
                <div className="instances-list">
                  {variant.instances.map((instance) => (
                    <div className="instance-row database-instance" key={instance.id}>
                      <div>
                        <strong>{instance.inventoryNumber}</strong>
                        <small>{instance.branchName} · {instance.locationName} · {CONDITION_LABELS[instance.conditionStatus] ?? instance.conditionStatus}</small>
                      </div>
                      <BarcodeClient value={instance.barcode} />
                      <span className={`badge ${instance.operationalStatus.toLowerCase()}`}>
                        {INSTANCE_STATUS_LABELS[instance.operationalStatus] ?? instance.operationalStatus}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
