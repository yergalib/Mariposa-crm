import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getCatalogCategories, getCatalogProducts, getCatalogProductsCount, type MoneyDto } from "@/lib/catalog/queries";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { getEffectivePermissions, requirePermission } from "@/lib/permissions/effective";
import { catalogSizeLabel } from "@/lib/catalog/labels";
import { OperationalItemSelector } from "@/components/OperationalItemSelector";

function parameter(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function formatMoney(money: MoneyDto) {
  return `${money.amountMinor.toLocaleString("ru-KZ")} ${money.currency}`;
}
function pageHref(query:{search:string;categoryId:string;includeArchived:boolean},page:number){const params=new URLSearchParams();if(query.search)params.set("q",query.search);if(query.categoryId)params.set("category",query.categoryId);if(query.includeArchived)params.set("archived","1");params.set("page",String(page));return `/products?${params}`;}

export default async function ProductsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[]; archived?: string | string[]; page?: string | string[]; ok?: string; error?: string }>;
}) {
  const session = await requireRouteAccess("/products");
  await requirePermission(session, "CATALOG_VIEW");
  const params = await searchParams;
  const search = parameter(params.q)?.trim() ?? "";
  const categoryId = parameter(params.category) ?? "";
  const includeArchived = parameter(params.archived) === "1";
  const tenant = createTenantContext(session.organizationId);
  const filter={tenant,search,categoryId:categoryId||undefined,includeArchived};
  const [total,categories,permissions] = await Promise.all([
    getCatalogProductsCount(filter),
    getCatalogCategories(tenant),
    getEffectivePermissions(session)
  ]);
  const pageCount=Math.max(1,Math.ceil(total/36)),requested=Number(parameter(params.page)),page=Number.isSafeInteger(requested)&&requested>0?Math.min(requested,pageCount):1;
  const products=await getCatalogProducts({...filter,defaultBranchId:session.defaultBranchId,page});
  const exportParams = new URLSearchParams();
  if (search) exportParams.set("q", search);
  if (categoryId) exportParams.set("category", categoryId);
  if (includeArchived) exportParams.set("archived", "1");

  return (
    <AppShell
      active="/products"
      title="Товары"
      subtitle={`Модели, размеры и физические экземпляры · ${total} найдено`}
      action={<div className="top-actions"><a className="secondary button-link" href={`/products/export?${exportParams}`}>↓ Excel</a>{permissions.has("CATALOG_IMPORT")&&<Link className="secondary button-link" href="/products/import">Импорт Excel</Link>}{permissions.has("CATALOG_EDIT")&&<Link className="secondary button-link" href="/products/settings">Категории и размеры</Link>}{permissions.has("CATALOG_CREATE")&&<Link className="primary button-link" href="/products/new">＋ Новый товар</Link>}</div>}
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
        <label className="archive-filter"><input type="checkbox" name="archived" value="1" defaultChecked={includeArchived}/> Черновики и архив</label>
      </form>
      <div className="catalog-scan-action"><OperationalItemSelector triggerLabel="Сканировать или ввести код"/></div>

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
                <div className="catalog-variant-groups">
                  {product.variantGroups.map((group,index) => <div className="catalog-variant-group" key={group.execution?.id??`direct-${index}`}>
                    {group.execution&&<div className="catalog-execution-title"><b>{group.execution.name}</b><span>{group.quantity} шт.</span></div>}
                    <div className="size-chips">{group.variants.map((variant) => {const label=catalogSizeLabel(variant.size);return <span key={variant.id}><b>{label.primary}</b>{label.secondary&&<small>{label.secondary}</small>}<em>×{variant.quantity}</em></span>})}</div>
                  </div>)}
                </div>
                {(product.rentalPrice||product.salePrice)&&<div className="price-line">
                  {product.rentalPrice&&<span>Аренда <b>{formatMoney(product.rentalPrice)}</b></span>}
                  {product.salePrice&&<span>Продажа <b>{formatMoney(product.salePrice)}</b></span>}
                </div>}
                {product.publicationStatus === "ARCHIVED"&&<span className="status-chip neutral">Архив</span>}
              </div>
            </Link>
          ))}
        </section>
      )}
      {pageCount>1&&<nav className="catalog-pagination" aria-label="Страницы каталога">
        {page>1?<Link className="secondary button-link" href={pageHref({search,categoryId,includeArchived},page-1)}>← Назад</Link>:<span/>}
        <span>Страница {page} из {pageCount}</span>
        {page<pageCount?<Link className="secondary button-link" href={pageHref({search,categoryId,includeArchived},page+1)}>Далее →</Link>:<span/>}
      </nav>}
    </AppShell>
  );
}
