"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { requireRouteAccess } from "@/lib/auth/session";
import { requireCatalogPermission } from "@/lib/catalog/permissions";
import { CatalogError } from "@/lib/catalog/errors";
import { addVariant, adjustBulkStock, archiveProduct, createCategory, createProduct, createSerializedInstances, createSize, replaceCurrentPrice, setVariantActive, updateCategory, updateProduct, updateSize } from "@/lib/catalog/management";
import { deleteProductImage, reorderProductImages, setPrimaryProductImage } from "@/lib/catalog/images";
import { createTenantContext } from "@/lib/tenant/context";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const nullable = (form: FormData, key: string) => text(form, key) || null;
const integer = (form: FormData, key: string, fallback = 0) => Number.parseInt(text(form, key), 10) || fallback;
const checked = (form: FormData, key: string) => form.get(key) === "on";
const errorMessage = (error: unknown) => { unstable_rethrow(error); return error instanceof CatalogError ? error.message : error instanceof ZodError ? error.issues[0]?.message ?? "Проверьте данные формы." : "Операция не выполнена."; };
const go = (path: string, kind: "ok" | "error", message: string): never => redirect(`${path}?${kind}=${encodeURIComponent(message)}`);

async function context(action: "MANAGE_CATALOG" | "MANAGE_INVENTORY" | "MANAGE_PHOTOS") {
  const session = await requireRouteAccess("/products");
  requireCatalogPermission(session.role, action);
  return { session, tenant: createTenantContext(session.organizationId) };
}

function productInput(form: FormData) {
  return { name: text(form, "name"), internalCode: text(form, "internalCode"), supplierModel: nullable(form, "supplierModel"), description: nullable(form, "description"), brand: nullable(form, "brand"), categoryId: nullable(form, "categoryId"), color: nullable(form, "color"), isRentable: checked(form, "isRentable"), isSellable: checked(form, "isSellable"), trackingMode: text(form, "trackingMode"), publicationStatus: text(form, "publicationStatus"), turnaroundBufferMinutes: text(form, "turnaroundBufferMinutes") ? integer(form, "turnaroundBufferMinutes") : null };
}

export async function createProductAction(form: FormData) {
  try { const { tenant } = await context("MANAGE_CATALOG"); const product = await createProduct(tenant, productInput(form)); revalidatePath("/products"); redirect(`/products/${product.id}?ok=${encodeURIComponent("Товар создан.")}`); } catch (error) { if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error; go("/products/new", "error", errorMessage(error)); }
}
export async function updateProductAction(form: FormData) {
  const id = text(form, "productId"); try { const { tenant } = await context("MANAGE_CATALOG"); await updateProduct(tenant, id, productInput(form)); revalidatePath(`/products/${id}`); go(`/products/${id}`, "ok", "Изменения сохранены."); } catch (error) { if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error; go(`/products/${id}/edit`, "error", errorMessage(error)); }
}
export async function archiveProductAction(form: FormData) { const id = text(form, "productId"); try { const { tenant } = await context("MANAGE_CATALOG"); await archiveProduct(tenant, id); revalidatePath("/products"); go("/products", "ok", "Товар архивирован."); } catch (error) { go(`/products/${id}`, "error", errorMessage(error)); } }
export async function createCategoryAction(form: FormData) { try { const { tenant } = await context("MANAGE_CATALOG"); await createCategory(tenant, { name: text(form,"name"), parentId: nullable(form,"parentId"), sortOrder: integer(form,"sortOrder"), status: text(form,"status") }); revalidatePath("/settings/catalog"); go("/settings/catalog","ok","Категория создана."); } catch(error) { go("/settings/catalog","error",errorMessage(error)); } }
export async function updateCategoryAction(form: FormData) { try { const { tenant } = await context("MANAGE_CATALOG"); await updateCategory(tenant,text(form,"categoryId"),{ name:text(form,"name"),parentId:nullable(form,"parentId"),sortOrder:integer(form,"sortOrder"),status:text(form,"status")}); revalidatePath("/settings/catalog"); go("/settings/catalog","ok","Категория обновлена."); } catch(error){ go("/settings/catalog","error",errorMessage(error)); } }
export async function createSizeAction(form: FormData) { try { const { tenant } = await context("MANAGE_CATALOG"); await createSize(tenant,{code:text(form,"code"),name:text(form,"name"),sizeSystem:nullable(form,"sizeSystem"),sortOrder:integer(form,"sortOrder"),isActive:checked(form,"isActive")}); revalidatePath("/settings/catalog"); go("/settings/catalog","ok","Размер создан."); } catch(error){ go("/settings/catalog","error",errorMessage(error)); } }
export async function updateSizeAction(form: FormData) { try { const { tenant } = await context("MANAGE_CATALOG"); await updateSize(tenant,text(form,"sizeId"),{code:text(form,"code"),name:text(form,"name"),sizeSystem:nullable(form,"sizeSystem"),sortOrder:integer(form,"sortOrder"),isActive:checked(form,"isActive")}); revalidatePath("/settings/catalog"); go("/settings/catalog","ok","Размер обновлён."); } catch(error){ go("/settings/catalog","error",errorMessage(error)); } }
export async function addVariantAction(form: FormData) { const productId=text(form,"productId"); try { const { tenant }=await context("MANAGE_CATALOG"); await addVariant(tenant,{productId,sizeId:text(form,"sizeId"),sku:text(form,"sku")}); revalidatePath(`/products/${productId}`); go(`/products/${productId}`,"ok","Вариант добавлен."); } catch(error){ go(`/products/${productId}`,"error",errorMessage(error)); } }
export async function setVariantActiveAction(form: FormData) { const productId=text(form,"productId"); try { const {tenant}=await context("MANAGE_CATALOG"); await setVariantActive(tenant,text(form,"variantId"),text(form,"isActive")==="true"); revalidatePath(`/products/${productId}`); go(`/products/${productId}`,"ok","Статус варианта изменён."); } catch(error){ go(`/products/${productId}`,"error",errorMessage(error)); } }
export async function replacePriceAction(form: FormData) { const productId=text(form,"productId"); try { const {tenant}=await context("MANAGE_CATALOG"); const amount=text(form,"amount"); if(!/^\d+$/.test(amount)) throw new CatalogError("VALIDATION","Цена должна быть целым числом тенге."); await replaceCurrentPrice(tenant,{variantId:text(form,"variantId"),branchId:nullable(form,"branchId"),type:text(form,"type") as "RENTAL"|"SALE",amountMinor:BigInt(amount),currency:text(form,"currency").toUpperCase()}); revalidatePath(`/products/${productId}`); go(`/products/${productId}`,"ok","Новая цена установлена."); } catch(error){ go(`/products/${productId}`,"error",errorMessage(error)); } }
export async function createInstancesAction(form: FormData) { const productId=text(form,"productId"); try { const {tenant}=await context("MANAGE_INVENTORY"); const cost=text(form,"purchaseCost"); await createSerializedInstances(tenant,{variantId:text(form,"variantId"),branchId:text(form,"branchId"),locationId:text(form,"locationId"),quantity:integer(form,"quantity"),purchaseCostMinor:cost?BigInt(cost):undefined,notes:nullable(form,"notes")}); revalidatePath(`/products/${productId}`); go(`/products/${productId}`,"ok","Экземпляры созданы."); } catch(error){ go(`/products/${productId}`,"error",errorMessage(error)); } }
export async function adjustStockAction(form: FormData) { const productId=text(form,"productId"); try { const {tenant,session}=await context("MANAGE_INVENTORY"); await adjustBulkStock(tenant,{variantId:text(form,"variantId"),branchId:text(form,"branchId"),locationId:nullable(form,"locationId"),delta:integer(form,"delta"),reason:text(form,"reason"),userId:session.userId}); revalidatePath(`/products/${productId}`); go(`/products/${productId}`,"ok","Остаток скорректирован."); } catch(error){ go(`/products/${productId}`,"error",errorMessage(error)); } }
export async function setPrimaryImageAction(form: FormData) { const productId=text(form,"productId"); try { const {tenant}=await context("MANAGE_PHOTOS"); await setPrimaryProductImage(tenant,text(form,"imageId")); revalidatePath(`/products/${productId}`); go(`/products/${productId}`,"ok","Главное фото изменено."); } catch(error){ go(`/products/${productId}`,"error",errorMessage(error)); } }
export async function deleteImageAction(form: FormData) { const productId=text(form,"productId"); try { const {tenant}=await context("MANAGE_PHOTOS"); await deleteProductImage(tenant,text(form,"imageId")); revalidatePath(`/products/${productId}`); go(`/products/${productId}`,"ok","Фото удалено."); } catch(error){ go(`/products/${productId}`,"error",errorMessage(error)); } }
export async function reorderImagesAction(form: FormData) { const productId=text(form,"productId"); try { const {tenant}=await context("MANAGE_PHOTOS"); await reorderProductImages(tenant,productId,text(form,"imageIds").split(",").filter(Boolean)); revalidatePath(`/products/${productId}`); go(`/products/${productId}`,"ok","Порядок фото сохранён."); } catch(error){ go(`/products/${productId}`,"error",errorMessage(error)); } }
