import { AppShell } from "@/components/AppShell";
import { requirePermission } from "@/lib/permissions/effective";
import { ProductForm } from "@/components/ProductForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { requireCatalogPermission } from "@/lib/catalog/permissions";
import { getCatalogManagementOptions } from "@/lib/catalog/queries";
import { createTenantContext } from "@/lib/tenant/context";
import { createProductAction } from "../actions";

export default async function NewProduct({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session=await requireRouteAccess("/products"); requireCatalogPermission(session.role,"MANAGE_CATALOG");
  await requirePermission(session, "CATALOG_VIEW");
  const { categories }=await getCatalogManagementOptions(createTenantContext(session.organizationId), session.hasOrganizationWideBranchAccess ? null : session.allowedBranchIds); const {error}=await searchParams;
  return <AppShell active="/products" title="Новый товар" subtitle="Модель товара и способ складского учёта">{error&&<p className="notice error">{error}</p>}<ProductForm action={createProductAction} categories={categories} /></AppShell>;
}
