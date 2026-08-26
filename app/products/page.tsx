import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getCatalogCategories, getCatalogProducts, type MoneyDto } from "@/lib/catalog/queries";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";

function parameter(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function formatMoney(money: MoneyDto | null) {
  return money ? `${money.amountMinor.toLocaleString("ru-KZ")} ${money.currency}` : "—";
}

export default async function ProductsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[] }>;
}) {
  const session = await requireRouteAccess("/products");
  const params = await searchParams;
  const search = parameter(params.q)?.trim() ?? "";
  const categoryId = parameter(params.category) ?? "";
  const tenant = createTenantContext(session.organizationId);
  const [products, categories] = await Promise.all([
    getCatalogProducts({
      tenant,
      defaultBranchId: session.defaultBranchId,
      search,
      categoryId: categoryId || undefined
    }),
    getCatalogCategories(tenant)
  ]);

  return (
    <AppShell
      active="/products"
      title="Товары"
      subtitle="Модели, размеры и физические экземпляры"
      action={<button className="primary" disabled title="Добавление товаров будет подключено отдельным этапом">＋ Новый товар</button>}
    >
      <form className="toolbar catalog-toolbar" method="get">
        <input name="q" defaultValue={search} placeholder="Поиск по названию, коду или SKU" />
        <select name="category" defaultValue={categoryId}>
          <option value="">Все категории</option>
          {categories.map((category) => (
            <option value={category.id} key={category.id}>{category.name}</option>
          ))}
        </select>
        <button className="secondary" type="submit">Найти</button>
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
                <span>MARIPOSA</span>
                <small>{product.hasImage ? "Фото ожидает подключения storage" : "Фото модели"}</small>
              </div>
              <div className="product-body">
                <div className="product-title">
                  <div>
                    <h2>{product.name}</h2>
                    <p>Код {product.internalCode}{product.color ? ` · ${product.color}` : ""}</p>
                  </div>
                  <span className="count">{product.totalInstances} шт.</span>
                </div>
                <div className="size-chips">
                  {product.sizes.map((size) => <span key={size}>{size}</span>)}
                </div>
                <div className="price-line">
                  <span>Аренда <b>{formatMoney(product.rentalPrice)}</b></span>
                  <span>Продажа <b>{formatMoney(product.salePrice)}</b></span>
                </div>
                <div className="stock-line">
                  <span>Физически доступно сейчас</span>
                  <b>{product.availableInstances} из {product.totalInstances}</b>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </AppShell>
  );
}
