import "server-only";

import { db } from "@/lib/db";
import { normalizeScannableCode } from "@/lib/catalog/scannable-code";
import { authorizeBulkOperation, type BulkOperationalActor } from "@/lib/fulfillment/bulk-authorization";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import type { TenantContext } from "@/lib/tenant/context";

export type InventoryScanResult =
  | { kind: "BULK_VARIANT"; code: string; variantId: string; productId: string; productName: string; executionName: string | null; size: string; sku: string }
  | { kind: "SERIALIZED_INSTANCE"; code: string; instanceId: string; variantId: string; productId: string; productName: string; executionName: string | null; size: string; barcode: string; inventoryNumber: string; branchId: string };

export function classifyInventoryScan<TVariant, TInstance>(variant: TVariant | null, instance: TInstance | null) {
  if (variant && instance) throw new FulfillmentError("DATA_INTEGRITY", "Код неоднозначен. Обратитесь к администратору каталога.");
  return variant ? { kind: "BULK_VARIANT" as const, value: variant } : instance ? { kind: "SERIALIZED_INSTANCE" as const, value: instance } : null;
}

export async function resolveInventoryScan(
  tenant: TenantContext,
  rawCode: string,
  actor: BulkOperationalActor,
  branchId?: string
): Promise<InventoryScanResult | null> {
  const code = normalizeScannableCode(rawCode);
  if (!code) return null;
  return db.$transaction(async (tx) => {
    await authorizeBulkOperation(tx, tenant, actor, "CATALOG_VIEW", branchId);
    const variants = await tx.productVariant.findMany({
        where: { organizationId: tenant.organizationId, sku: { equals: code, mode: "insensitive" }, isActive: true, product: { trackingMode: "BULK", archivedAt: null } },
        select: { id: true, productId: true, sku: true, product: { select: { name: true } }, execution: { select: { name: true } }, size: { select: { code: true, name: true, sizeSystem: true } } }
        ,take: 2
      });
    const instances = await tx.productInstance.findMany({
        where: { organizationId: tenant.organizationId, barcode: { equals: code, mode: "insensitive" }, productVariant: { product: { trackingMode: "SERIALIZED", archivedAt: null } } },
        select: { id: true, productVariantId: true, inventoryNumber: true, barcode: true, currentBranchId: true, productVariant: { select: { productId: true, product: { select: { name: true } }, execution: { select: { name: true } }, size: { select: { code: true, name: true, sizeSystem: true } } } } }
        ,take: 2
      });
    if (variants.length > 1 || instances.length > 1) throw new FulfillmentError("DATA_INTEGRITY", "Код неоднозначен. Обратитесь к администратору каталога.");
    const variant = variants[0] ?? null, instance = instances[0] ?? null;
    const classified = classifyInventoryScan(variant, instance);
    if (classified?.kind === "BULK_VARIANT") return { kind: "BULK_VARIANT", code, variantId: variant!.id, productId: variant!.productId, productName: variant!.product.name, executionName: variant!.execution?.name ?? null, size: variant!.size.sizeSystem === "ONE_SIZE" ? "Без размера" : variant!.size.name || variant!.size.code, sku: variant!.sku };
    if (!instance) return null;
    await authorizeBulkOperation(tx, tenant, actor, "CATALOG_VIEW", branchId ?? instance.currentBranchId);
    if (branchId && instance.currentBranchId !== branchId) throw new FulfillmentError("NOT_FOUND", "Код не найден в выбранном филиале.");
    return { kind: "SERIALIZED_INSTANCE", code, instanceId: instance.id, variantId: instance.productVariantId, productId: instance.productVariant.productId, productName: instance.productVariant.product.name, executionName: instance.productVariant.execution?.name ?? null, size: instance.productVariant.size.sizeSystem === "ONE_SIZE" ? "Без размера" : instance.productVariant.size.name || instance.productVariant.size.code, barcode: instance.barcode, inventoryNumber: instance.inventoryNumber, branchId: instance.currentBranchId };
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 20_000 });
}

export async function getOutstandingBulkRentalsForVariant(tenant: TenantContext, variantId: string, actor: BulkOperationalActor) {
  return db.$transaction(async (tx) => {
    const membership = await authorizeBulkOperation(tx, tenant, actor, "ORDER_VIEW");
    const branchIds = membership.role === "OWNER" ? null : membership.branchAccess.map((row) => row.branchId);
    if (branchIds && branchIds.length === 0) return [];
    const allocations = await tx.capacityAllocation.findMany({
      where: { organizationId: tenant.organizationId, productVariantId: variantId, sourceType: "ORDER", issuedQuantity: { gt: 0 }, branchId: branchIds ? { in: branchIds } : undefined },
      select: { id: true, issuedQuantity: true, returnedQuantity: true, orderId: true, order: { select: { id: true, orderNumber: true, rentalEndAt: true, branch: { select: { name: true } }, customer: { select: { firstName: true, lastName: true } } } }, bulkPhysicalResolutions: { where: { kind: "LOSS_RESOLUTION" }, select: { totalQuantity: true } } },
      orderBy: [{ issuedAt: "asc" }, { id: "asc" }]
    });
    return allocations.flatMap((allocation) => {
      const lost = allocation.bulkPhysicalResolutions.reduce((sum, row) => sum + row.totalQuantity, 0);
      const outstanding = allocation.issuedQuantity - allocation.returnedQuantity - lost;
      return allocation.order && outstanding > 0 ? [{ allocationId: allocation.id, orderId: allocation.order.id, orderNumber: allocation.order.orderNumber, branchName: allocation.order.branch.name, customerName: [allocation.order.customer.firstName, allocation.order.customer.lastName].filter(Boolean).join(" "), rentalEndAt: allocation.order.rentalEndAt, outstanding }] : [];
    });
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 20_000 });
}
