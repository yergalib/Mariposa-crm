import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { variantOperationWhere, type CatalogOperation } from "./operation-policy";

type PolicyClient = Pick<Prisma.TransactionClient, "productVariant" | "$queryRaw">;
type VariantReferences = { id: string; product_id: string; execution_id: string | null; size_id: string };
const uniqueSorted = (ids: string[]) => [...new Set(ids)].sort();

/** Must run in the transaction that creates the commitment/inquiry, before its writes.
 * SHARE row locks last until commit/rollback and conflict with ordinary UPDATE,
 * including legacy flag writers. Lock variants first to freeze their references,
 * then products, executions and sizes in stable ID order; recheck after all locks.
 * Multi-row policy/import writers must use the same order with FOR UPDATE.
 */
export async function variantsAllowOperation(client: PolicyClient, organizationId: string, variantIds: string[], operation: CatalogOperation, published = false) {
  const ids = uniqueSorted(variantIds);
  if (!ids.length) return false;
  const variants = await client.$queryRaw<VariantReferences[]>(Prisma.sql`
    SELECT id, product_id, execution_id, size_id FROM public.product_variants
    WHERE organization_id=${organizationId}::uuid AND id IN (${Prisma.join(ids)})
    ORDER BY id FOR SHARE`);
  if (variants.length !== ids.length) return false;
  const productIds = uniqueSorted(variants.map(v => v.product_id));
  const products = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM public.products
    WHERE organization_id=${organizationId}::uuid AND id IN (${Prisma.join(productIds)})
    ORDER BY id FOR SHARE`);
  if (products.length !== productIds.length) return false;
  const executionIds = uniqueSorted(variants.flatMap(v => v.execution_id ? [v.execution_id] : []));
  if (executionIds.length) {
    const executions = await client.$queryRaw<Array<{ id: string; product_id: string }>>(Prisma.sql`
      SELECT id, product_id FROM public.product_executions
      WHERE organization_id=${organizationId}::uuid AND id IN (${Prisma.join(executionIds)})
      ORDER BY id FOR SHARE`);
    const executionProducts = new Map(executions.map(e => [e.id, e.product_id]));
    if (executions.length !== executionIds.length || variants.some(v => v.execution_id && executionProducts.get(v.execution_id) !== v.product_id)) return false;
  }
  const sizeIds = uniqueSorted(variants.map(v => v.size_id));
  const sizes = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM public.sizes
    WHERE organization_id=${organizationId}::uuid AND id IN (${Prisma.join(sizeIds)})
    ORDER BY id FOR SHARE`);
  if (sizes.length !== sizeIds.length) return false;
  const eligible = await client.productVariant.findMany({ where: { ...variantOperationWhere(organizationId, operation, published), id: { in: ids } }, select: { id: true } });
  return eligible.length === ids.length;
}
