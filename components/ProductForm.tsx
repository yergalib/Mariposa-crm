import type { CatalogProductDetailDto } from "@/lib/catalog/queries";

export function ProductForm({ action, categories, product }: { action: (formData: FormData) => void | Promise<void>; categories: Array<{ id: string; name: string }>; product?: CatalogProductDetailDto }) {
  return <form action={action} className="card management-form">
    {product && <input type="hidden" name="productId" value={product.id} />}
    <div className="form-grid">
      <label>Название<input name="name" required maxLength={160} defaultValue={product?.name} /></label>
      <label>Внутренний код<input name="internalCode" required maxLength={80} defaultValue={product?.internalCode} /></label>
      <label>Модель поставщика<input name="supplierModel" maxLength={120} defaultValue={product?.supplierModel ?? ""} /></label>
      <label>Бренд<input name="brand" maxLength={120} defaultValue={product?.brand ?? ""} /></label>
      <label>Категория<select name="categoryId" defaultValue={product?.categoryId ?? ""}><option value="">Без категории</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Цвет<input name="color" maxLength={120} defaultValue={product?.color ?? ""} /></label>
      <label>Способ учёта<select name="trackingMode" defaultValue={product?.trackingMode ?? "BULK"} disabled={product?.trackingModeChangeLocked}><option value="BULK">Количественный учёт</option><option value="SERIALIZED">Поэкземплярный учёт</option></select>{product?.trackingModeChangeLocked&&<input type="hidden" name="trackingMode" value={product.trackingMode}/>}<small>{product?.trackingModeChangeLocked?"Способ учёта нельзя изменить после появления складской, закупочной или заказной истории.":"Количественный — для одинаковых товаров одного размера. Поэкземплярный — когда каждый физический экземпляр нужно отслеживать отдельно."}</small></label>
      <label>Публикация<select name="publicationStatus" defaultValue={product?.publicationStatus ?? "DRAFT"}><option value="DRAFT">Черновик</option><option value="ACTIVE">Активен</option><option value="ARCHIVED">Архив</option></select></label>
      <label>Буфер обслуживания, минут<input type="number" name="turnaroundBufferMinutes" min="0" max="10080" defaultValue={product?.turnaroundBufferMinutes ?? ""} /></label>
    </div>
    <label>Описание<textarea name="description" rows={5} maxLength={4000} defaultValue={product?.description ?? ""} /></label>
    <div className="check-row"><label><input type="checkbox" name="isRentable" defaultChecked={product?.isRentable ?? true} /> Доступен для аренды</label><label><input type="checkbox" name="isSellable" defaultChecked={product?.isSellable ?? true} /> Доступен для продажи</label></div>
    <button className="primary" type="submit">Сохранить</button>
  </form>;
}
