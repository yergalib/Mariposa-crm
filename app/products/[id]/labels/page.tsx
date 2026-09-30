import Link from "next/link";
import { notFound } from "next/navigation";
import { LabelPrintSheet, type PrintableLabel } from "@/components/catalog/LabelPrintSheet";
import { requireRouteAccess } from "@/lib/auth/session";
import { canPerformCatalogAction } from "@/lib/auth/access";
import { catalogSizeLabel } from "@/lib/catalog/labels";
import { getCatalogProductById } from "@/lib/catalog/queries";
import { createTenantContext } from "@/lib/tenant/context";

export default async function ProductLabels({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRouteAccess("/products");
  if (!canPerformCatalogAction(session.role, "MANAGE_INVENTORY")) notFound();
  const { id } = await params;
  const product = await getCatalogProductById({ tenant: createTenantContext(session.organizationId), defaultBranchId: session.defaultBranchId, productId: id });
  if (!product) notFound();

  const labels: PrintableLabel[] = product.publicationStatus === "ARCHIVED" ? [] : product.variants.filter(variant => variant.isActive).flatMap(variant => {
    const size = catalogSizeLabel(variant.size);
    const description = [variant.execution?.name, size.primary, size.secondary].filter(Boolean).join(" · ");
    if (product.trackingMode === "BULK") return [{ id: variant.id, code: variant.sku, name: product.name, description }];
    return variant.instances.map(instance => ({ id: instance.id, code: instance.barcode, name: product.name, description: `${description} · ${instance.inventoryNumber}` }));
  });

  return <main className="label-print-page">
    <header className="label-print-header"><div><Link href={`/products/${id}`} className="label-print-back">← К товару</Link><h1>Этикетки · {product.name}</h1><p>Для количественного учёта печатается SKU варианта, для поэкземплярного — штрихкод каждого экземпляра.</p></div></header>
    {product.publicationStatus === "ARCHIVED" ? <p className="notice error">Товар в архиве. Печать новых этикеток недоступна.</p> : <LabelPrintSheet labels={labels}/>}
  </main>;
}
