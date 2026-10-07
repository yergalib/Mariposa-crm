import { getCatalogReadScope } from "@/lib/catalog/access";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/permissions/effective";
import { AppShell } from "@/components/AppShell";
import { ProductForm } from "@/components/ProductForm";
import { requireRouteAccess } from "@/lib/auth/session";

import { getCatalogManagementOptions, getCatalogProductById } from "@/lib/catalog/queries";
import { createTenantContext } from "@/lib/tenant/context";
import { updateProductAction } from "../../actions";

export default async function EditProduct({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string}>}){
 const session=await requireRouteAccess("/products"); await requirePermission(session,"CATALOG_EDIT"); const {id}=await params; const tenant=createTenantContext(session.organizationId);
 await requirePermission(session, "CATALOG_VIEW");
 const [product,{categories}]=await Promise.all([getCatalogProductById({tenant,allowedBranchIds: await getCatalogReadScope(session), defaultBranchId:session.defaultBranchId,productId:id}),getCatalogManagementOptions(tenant, await getCatalogReadScope(session))]); if(!product)notFound(); const {error}=await searchParams;
 return <AppShell active="/products" title={`Редактирование: ${product.name}`}>{error&&<p className="notice error">{error}</p>}<ProductForm action={updateProductAction} categories={categories} product={product}/></AppShell>;
}
