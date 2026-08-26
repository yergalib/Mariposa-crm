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
    const file = form.get("file");
    if (!(file instanceof File)) throw new CatalogError("VALIDATION", "Выберите файл.");
    await uploadProductImage(createTenantContext(session.organizationId), { productId: id, file, altText: String(form.get("altText") ?? "") });
    return NextResponse.redirect(new URL(`/products/${id}?ok=${encodeURIComponent("Фото загружено.")}`, request.url), 303);
  } catch (error) {
    const message = error instanceof CatalogError ? error.message : "Не удалось загрузить фото.";
    return NextResponse.redirect(new URL(`/products/${id}?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
