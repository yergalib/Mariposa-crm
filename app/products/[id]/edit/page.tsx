import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProductForm } from "@/components/ProductForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { requireCatalogPermission } from "@/lib/catalog/permissions";
import { getCatalogManagementOptions, getCatalogProductById } from "@/lib/catalog/queries";
import { createTenantContext } from "@/lib/tenant/context";
import { updateProductAction } from "../../actions";

export default async function EditProduct({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string}>}){
 const session=await requireRouteAccess("/products"); requireCatalogPermission(session.role,"MANAGE_CATALOG"); const {id}=await params; const tenant=createTenantContext(session.organizationId);
 const [product,{categories}]=await Promise.all([getCatalogProductById({tenant,defaultBranchId:session.defaultBranchId,productId:id}),getCatalogManagementOptions(tenant)]); if(!product)notFound(); const {error}=await searchParams;
 return <AppShell active="/products" title={`Редактирование: ${product.name}`}>{error&&<p className="notice error">{error}</p>}<ProductForm action={updateProductAction} categories={categories} product={product}/></AppShell>;
}
