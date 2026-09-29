import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { canPerformCatalogAction } from "@/lib/auth/access";
import { CatalogError } from "@/lib/catalog/errors";
import { uploadProductImage } from "@/lib/catalog/images";
import { createTenantContext } from "@/lib/tenant/context";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url), 303);
  if (!canPerformCatalogAction(session.role, "MANAGE_PHOTOS")) return NextResponse.redirect(new URL(`/products/${id}?error=${encodeURIComponent("Недостаточно прав.")}`, request.url), 303);
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length) {
      const legacy = form.get("file");
      if (legacy instanceof File && legacy.size > 0) files.push(legacy);
    }
    if (!files.length) throw new CatalogError("VALIDATION", "Выберите фото.");
    if (files.length > 10 || files.reduce((sum, file) => sum + file.size, 0) > 4 * 1024 * 1024)
      throw new CatalogError("IMAGE_TOO_LARGE", "Выберите не больше 10 фото общим размером до 4 МБ.");
    const tenant = createTenantContext(session.organizationId);
    let uploaded = 0;
    try {
      for (const file of files) {
        await uploadProductImage(tenant, { productId: id, executionId: String(form.get("executionId") ?? "").trim() || null, file, altText: String(form.get("altText") ?? "") });
        uploaded++;
      }
    } catch (error) {
      const message = error instanceof CatalogError ? error.message : "Не удалось загрузить фото.";
      throw new CatalogError("VALIDATION", `Загружено ${uploaded} из ${files.length}. ${message}`);
    }
    return NextResponse.redirect(new URL(`/products/${id}?ok=${encodeURIComponent(`Загружено фото: ${uploaded}.`)}`, request.url), 303);
  } catch (error) {
    const message = error instanceof CatalogError ? error.message : "Не удалось загрузить фото.";
    return NextResponse.redirect(new URL(`/products/${id}?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
