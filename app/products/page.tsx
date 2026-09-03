import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getCatalogCategories, getCatalogProducts, type MoneyDto } from "@/lib/catalog/queries";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { getEffectivePermissions } from "@/lib/permissions/effective";

function parameter(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function formatMoney(money: MoneyDto | null) {
  return money ? `${money.amountMinor.toLocaleString("ru-KZ")} ${money.currency}` : "—";
}

export default async function ProductsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[]; archived?: string | string[]; ok?: string; error?: string }>;
}) {
  const session = await requireRouteAccess("/products");
  const params = await searchParams;
  const search = parameter(params.q)?.trim() ?? "";
  const categoryId = parameter(params.category) ?? "";
  const includeArchived = parameter(params.archived) === "1";
  const tenant = createTenantContext(session.organizationId);
  const [products, categories, permissions] = await Promise.all([
    getCatalogProducts({
      tenant,
      defaultBranchId: session.defaultBranchId,
      search,
      categoryId: categoryId || undefined, includeArchived
    }),
    getCatalogCategories(tenant),
    getEffectivePermissions(session)
  ]);

  return (
    <AppShell
      active="/products"
      title="Товары"
      subtitle="Модели, размеры и физические экземпляры"
      action={permissions.has("CATALOG_CREATE")||permissions.has("CATALOG_EDIT")?<div className="top-actions">{permissions.has("CATALOG_EDIT")&&<Link className="secondary button-link" href="/products/settings">Категории и размеры</Link>}{permissions.has("CATALOG_CREATE")&&<Link className="primary button-link" href="/products/new">＋ Новый товар</Link>}</div>:undefined}
    >
      {params.ok&&<p className="notice ok">{params.ok}</p>}{params.error&&<p className="notice error">{params.error}</p>}
      <form className="toolbar catalog-toolbar" method="get">
        <input name="q" defaultValue={search} placeholder="Поиск по названию, коду или SKU" />
        <select name="category" defaultValue={categoryId}>
          <option value="">Все категории</option>
          {categories.map((category) => (
            <option value={category.id} key={category.id}>{category.name}</option>
          ))}
        </select>
        <button className="secondary" type="submit">Найти</button>
        <label className="archive-filter"><input type="checkbox" name="archived" value="1" defaultChecked={includeArchived}/> Показать архив</label>
      </form>

      {products.length === 0 ? (
        <section className="empty-state">
          <div>MARIPOSA</div>
          <h2>Товары не найдены</h2>
          <p>Измените поисковый запрос или фильтр категории.</p>
        </section>
      ) : (
        <section className="product-grid">
          {products.map((product) => (
            <Link href={`/products/${product.id}`} key={product.id} className="product-card">
              <div className="photo-placeholder">
                {product.imageUrl ? <img src={product.imageUrl} alt={product.name}/> : <><span>MARIPOSA</span><small>Фото модели</small></>}
              </div>
              <div className="product-body">
                <div className="product-title">
                  <div>
                    <h2>{product.name}</h2>
                    <p>Код {product.internalCode}{product.color ? ` · ${product.color}` : ""}</p>
                  </div>
                  <span className="count">{product.trackingMode === "SERIALIZED" ? product.totalInstances : product.totalStock} шт.</span>
                </div>
                <div className="size-chips">
                  {product.sizes.map((size) => <span key={size}>{size}</span>)}
                </div>
                <div className="price-line">
                  <span>Аренда <b>{formatMoney(product.rentalPrice)}</b></span>
                  <span>Продажа <b>{formatMoney(product.salePrice)}</b></span>
                </div>
                <div className="stock-line">
                  <span>{product.trackingMode === "SERIALIZED" ? "Поэкземплярный учёт" : "Количественный учёт"}</span>
                  <b>{product.publicationStatus === "ARCHIVED" ? "Архив" : product.trackingMode === "SERIALIZED" ? `${product.availableInstances} из ${product.totalInstances}` : product.totalStock}</b>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </AppShell>
  );
}
