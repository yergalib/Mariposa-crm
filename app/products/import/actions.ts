"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { applyProductSheet, previewProductSheet } from "@/lib/catalog/product-sheet-import";

function fail(error: unknown, path: string): never {
  unstable_rethrow(error);
  const message = error instanceof Error ? error.message : "Не удалось обработать файл.";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function uploadProductSheetAction(form: FormData) {
  const session = await requireRouteAccess("/products");
  await requirePermission(session, "CATALOG_IMPORT");
  try {
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Выберите файл XLSX.");
    const batch = await previewProductSheet(session.organizationId, session.userId, file);
    redirect(`/products/import/${batch.id}`);
  } catch (error) { fail(error, "/products/import"); }
}

export async function confirmProductSheetAction(form: FormData) {
  const session = await requireRouteAccess("/products");
  await requirePermission(session, "CATALOG_IMPORT");
  const id = String(form.get("batchId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/products/import?error=Некорректный%20импорт");
  try {
    const result = await applyProductSheet(session.organizationId, session.userId, id);
    revalidatePath("/products");
    redirect(`/products?archived=1&ok=${encodeURIComponent(`Создано ${result.products} черновиков и ${result.variants} размеров. Проверьте товары и опубликуйте их.`)}`);
  } catch (error) { fail(error, `/products/import/${id}`); }
}
