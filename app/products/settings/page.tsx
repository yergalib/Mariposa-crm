import Link from "next/link";
import { RetainedActionForm } from "@/components/RetainedActionForm";
import { getCatalogReadScope } from "@/lib/catalog/access";
import { AppShell } from "@/components/AppShell";
import { requirePermission } from "@/lib/permissions/effective";
import { requireRouteAccess } from "@/lib/auth/session";
import { requireCatalogPermission } from "@/lib/catalog/permissions";
import { getCatalogManagementOptions } from "@/lib/catalog/queries";
import { createTenantContext } from "@/lib/tenant/context";
import { createCategoryAction, createSizeAction, updateCategoryAction, updateSizeAction } from "../actions";
export default async function CatalogSettings({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const session = await requireRouteAccess("/products"); requireCatalogPermission(session.role,"MANAGE_CATALOG"); await requirePermission(session,"CATALOG_VIEW"); await requirePermission(session,"CATALOG_EDIT");
  const data = await getCatalogManagementOptions(createTenantContext(session.organizationId), await getCatalogReadScope(session)), msg = await searchParams;
  return <AppShell active="/products" title="Категории и размеры" subtitle="Существующие справочники каталога"><Link href="/settings">Все настройки</Link>{msg.ok && <p className="notice ok">{msg.ok}</p>}
    <p>Изменение справочника не переписывает сохранённые документы и названия позиций старых заказов. Архив и отключение используются вместо удаления.</p>
    <div className="management-columns reference-settings"><section className="card"><h2>Категории</h2>{[null,...data.categories].map(category => <RetainedActionForm key={category?.id ?? "new"} action={category ? updateCategoryAction : createCategoryAction} className="reference-form">
      <h3>{category?.name ?? "Новая категория"}</h3>{category && <input type="hidden" name="categoryId" value={category.id}/>}
      <label>Название<input name="name" defaultValue={category?.name} required maxLength={120}/></label><label>Родительская категория<select name="parentId" defaultValue={category?.parentId ?? ""}><option value="">Без родителя</option>{data.categories.filter(c=>c.id!==category?.id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Порядок<input name="sortOrder" type="number" min="-100000" max="100000" step="1" defaultValue={category?.sortOrder ?? 0}/></label><label>Статус<select name="status" defaultValue={category?.status ?? "ACTIVE"}><option value="DRAFT">Черновик</option><option value="ACTIVE">Активна</option><option value="ARCHIVED">Архив</option></select></label><button className="secondary">{category ? "Сохранить категорию" : "Добавить категорию"}</button>{category && <small>{category._count.products} товаров</small>}
    </RetainedActionForm>)}</section><section className="card"><h2>Размеры</h2><datalist id="size-systems">{[...new Set([...data.sizes.map(size=>size.sizeSystem),'LEGACY'])].map(value=><option key={value} value={value}/>)}</datalist>{[null,...data.sizes].map(size=><RetainedActionForm key={size?.id ?? "new"} action={size ? updateSizeAction : createSizeAction} className="reference-form">
      <h3>{size ? `${size.code} · ${size.name}` : "Новый размер"}</h3>{size && <input type="hidden" name="sizeId" value={size.id}/>}<label>Код<input name="code" defaultValue={size?.code} required maxLength={40}/></label><label>Название<input name="name" defaultValue={size?.name} required maxLength={80}/></label><label>Система размеров<input name="sizeSystem" list="size-systems" defaultValue={size?.sizeSystem ?? "LEGACY"} maxLength={80}/></label><label>Рекомендуемый рост, см<input name="recommendedHeightCm" type="number" min="1" max="300" step="1" defaultValue={size?.recommendedHeightCm ?? ""}/></label><label>Длина, см<input name="lengthCm" type="number" min="1" max="1000" step="1" defaultValue={size?.lengthCm ?? ""}/></label><p>Пустое поле роста или длины означает «не указано». Код системы сохраняется как введён; существующие нестандартные значения допустимы.</p><label>Порядок<input name="sortOrder" type="number" min="-100000" max="100000" step="1" defaultValue={size?.sortOrder ?? 0}/></label><label><input name="isActive" type="checkbox" defaultChecked={size?.isActive ?? true}/> Активный размер</label><button className="secondary">{size ? "Сохранить размер" : "Добавить размер"}</button>{size && <small>{size._count.variants} вариантов</small>}
    </RetainedActionForm>)}</section></div>
  </AppShell>;
}
