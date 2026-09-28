import "server-only";

import { db } from "@/lib/db";
import { authorizeBulkOperation, type BulkOperationalActor } from "@/lib/fulfillment/bulk-authorization";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import { resolveOperationalIdentifier, type ScanPurpose } from "@/lib/inventory/operational-identifier";
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
  branchId?: string,
  purpose: ScanPurpose = "CATALOG_LOOKUP"
): Promise<InventoryScanResult | null> {
  const result = await resolveOperationalIdentifier(tenant, { rawIdentifier: rawCode, purpose, branchId }, actor);
  if (result.kind === "AMBIGUOUS_IDENTIFIER") throw new FulfillmentError("DATA_INTEGRITY", "Код неоднозначен. Обратитесь к администратору каталога.");
  if (result.kind === "NOT_FOUND" && result.reason === "BRANCH_MISMATCH") throw new FulfillmentError("NOT_FOUND", "Код не найден в выбранном филиале.");
  if (result.kind === "BULK_VARIANT") return { kind: result.kind, code: result.normalizedIdentifier, variantId: result.variant.id, productId: result.product.id, productName: result.product.name, executionName: result.execution?.name ?? null, size: result.variant.size.sizeSystem === "ONE_SIZE" ? "Без размера" : result.variant.size.name || result.variant.size.code, sku: result.variant.sku };
  if (result.kind === "SERIALIZED_INSTANCE") return { kind: result.kind, code: result.normalizedIdentifier, instanceId: result.instance.id, variantId: result.variant.id, productId: result.product.id, productName: result.product.name, executionName: result.execution?.name ?? null, size: result.variant.size.sizeSystem === "ONE_SIZE" ? "Без размера" : result.variant.size.name || result.variant.size.code, barcode: result.instance.barcode, inventoryNumber: result.instance.inventoryNumber, branchId: result.instance.branchId };
  return null;
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
