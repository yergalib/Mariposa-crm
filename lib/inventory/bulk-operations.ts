import "server-only";

import { db } from "@/lib/db";
import { calculatePeakBlockedCapacity, getVariantAvailabilityWithClient } from "@/lib/availability/capacity";
import { authorizeBulkOperation, type BulkOperationalActor } from "@/lib/fulfillment/bulk-authorization";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import type { TenantContext } from "@/lib/tenant/context";

export async function getBulkMaintenanceQueue(tenant: TenantContext, actor: BulkOperationalActor) {
  return db.$transaction(async (tx) => {
    const membership = await authorizeBulkOperation(tx, tenant, actor, "INVENTORY_VIEW");
    const branchIds = membership.role === "OWNER" ? null : membership.branchAccess.map((access) => access.branchId);
    if (branchIds && branchIds.length === 0) return [];
    const allocations = await tx.capacityAllocation.findMany({
      where: {
        organizationId: tenant.organizationId,
        branchId: branchIds ? { in: branchIds } : undefined,
        sourceType: "MAINTENANCE",
        productInstanceId: null,
        status: "ACTIVE",
        productVariant: { product: { trackingMode: "BULK" } }
      },
      select: {
        id: true,
        branchId: true,
        productVariantId: true,
        quantity: true,
        maintenanceKind: true,
        maintenanceLocationId: true,
        blockedFrom: true
      },
      orderBy: [{ blockedFrom: "asc" }, { id: "asc" }]
    });
    const branchRows = await tx.branch.findMany({ where: { organizationId: tenant.organizationId, id: { in: [...new Set(allocations.map((row) => row.branchId))] } }, select: { id: true, name: true } });
    const locationRows = await tx.location.findMany({ where: { organizationId: tenant.organizationId, id: { in: allocations.map((row) => row.maintenanceLocationId!).filter(Boolean) } }, select: { id: true, name: true } });
    const variants = await tx.productVariant.findMany({ where: { organizationId: tenant.organizationId, id: { in: [...new Set(allocations.map((row) => row.productVariantId))] } }, select: { id: true, sku: true, productId: true, sizeId: true } });
    const products = await tx.product.findMany({ where: { organizationId: tenant.organizationId, id: { in: [...new Set(variants.map((row) => row.productId))] } }, select: { id: true, name: true } });
    const sizes = await tx.size.findMany({ where: { organizationId: tenant.organizationId, id: { in: [...new Set(variants.map((row) => row.sizeId))] } }, select: { id: true, code: true, name: true } });
    const events = await tx.bulkMaintenanceEvent.groupBy({ by: ["capacityAllocationId"], where: { organizationId: tenant.organizationId, capacityAllocationId: { in: allocations.map((row) => row.id) } }, _sum: { quantity: true } });
    const branchById = new Map(branchRows.map((row) => [row.id, row]));
    const locationById = new Map(locationRows.map((row) => [row.id, row]));
    const variantById = new Map(variants.map((row) => [row.id, row]));
    const productById = new Map(products.map((row) => [row.id, row]));
    const sizeById = new Map(sizes.map((row) => [row.id, row]));
    const terminalByAllocation = new Map(events.map((row) => [row.capacityAllocationId, row._sum.quantity ?? 0]));
    return allocations.map((allocation) => ({
      id: allocation.id,
      branchId: allocation.branchId,
      branchName: branchById.get(allocation.branchId)?.name ?? "—",
      productVariantId: allocation.productVariantId,
      productName: productById.get(variantById.get(allocation.productVariantId)?.productId ?? "")?.name ?? "—",
      size: (() => { const size = sizeById.get(variantById.get(allocation.productVariantId)?.sizeId ?? ""); return size?.name || size?.code || "—"; })(),
      sku: variantById.get(allocation.productVariantId)?.sku ?? "—",
      kind: allocation.maintenanceKind!,
      locationId: allocation.maintenanceLocationId!,
      locationName: locationById.get(allocation.maintenanceLocationId ?? "")?.name ?? "—",
      startedAt: allocation.blockedFrom,
      activeQuantity: Math.max(0, allocation.quantity - (terminalByAllocation.get(allocation.id) ?? 0))
    })).filter((allocation) => allocation.activeQuantity > 0);
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });
}

export async function getBulkVariantOperationalState(
  tenant: TenantContext,
  input: { branchId: string; productVariantId: string; from: Date; until: Date },
  actor: BulkOperationalActor
) {
  return db.$transaction(async (tx) => {
    await authorizeBulkOperation(tx, tenant, actor, "INVENTORY_VIEW", input.branchId);
    const variant = await tx.productVariant.findFirst({
      where: { id: input.productVariantId, organizationId: tenant.organizationId, product: { trackingMode: "BULK" } },
      select: { id: true, sku: true, productId: true, sizeId: true }
    });
    if (!variant) throw new FulfillmentError("NOT_FOUND", "BULK-вариант не найден.");
    const product = await tx.product.findUnique({ where: { id: variant.productId }, select: { name: true } });
    const size = await tx.size.findUnique({ where: { id: variant.sizeId }, select: { code: true, name: true } });
    const onHand = await tx.stockLevel.aggregate({ where: { organizationId: tenant.organizationId, branchId: input.branchId, productVariantId: input.productVariantId }, _sum: { quantity: true } });
    const orderAllocations = await tx.capacityAllocation.findMany({
        where: { organizationId: tenant.organizationId, branchId: input.branchId, productVariantId: input.productVariantId, sourceType: "ORDER" },
        select: { id: true, quantity: true, issuedQuantity: true, returnedQuantity: true, status: true, blockedFrom: true, blockedUntil: true }
      });
    const lossRows = await tx.bulkPhysicalResolution.groupBy({
      by: ["capacityAllocationId"],
      where: { organizationId: tenant.organizationId, kind: "LOSS_RESOLUTION", capacityAllocationId: { in: orderAllocations.map((allocation) => allocation.id) } },
      _sum: { totalQuantity: true }
    });
    const lossByAllocation = new Map(lossRows.map((row) => [row.capacityAllocationId, row._sum.totalQuantity ?? 0]));
    const maintenanceAllocations = await tx.capacityAllocation.findMany({
        where: { organizationId: tenant.organizationId, branchId: input.branchId, productVariantId: input.productVariantId, sourceType: "MAINTENANCE", productInstanceId: null, status: "ACTIVE" },
        select: { id: true, quantity: true, maintenanceKind: true }
      });
    const maintenanceEvents = await tx.bulkMaintenanceEvent.groupBy({ by: ["capacityAllocationId"], where: { organizationId: tenant.organizationId, capacityAllocationId: { in: maintenanceAllocations.map((allocation) => allocation.id) } }, _sum: { quantity: true } });
    const terminalByAllocation = new Map(maintenanceEvents.map((row) => [row.capacityAllocationId, row._sum.quantity ?? 0]));
    const availability = await getVariantAvailabilityWithClient(tx, { tenant, branchId: input.branchId, productVariantId: input.productVariantId, requestedFrom: input.from, requestedUntil: input.until, requestedQuantity: 1 });
    const issuedOutstanding = orderAllocations.reduce((sum, allocation) => sum + Math.max(0,
      allocation.issuedQuantity - allocation.returnedQuantity
      - (lossByAllocation.get(allocation.id) ?? 0)
    ), 0);
    const maintenance = maintenanceAllocations.reduce((result, allocation) => {
      const remaining = Math.max(0, allocation.quantity - (terminalByAllocation.get(allocation.id) ?? 0));
      if (allocation.maintenanceKind === "CLEANING") result.cleaning += remaining;
      if (allocation.maintenanceKind === "REPAIR") result.repair += remaining;
      return result;
    }, { cleaning: 0, repair: 0 });
    const plannedReservations = calculatePeakBlockedCapacity(orderAllocations
      .filter((allocation) => allocation.status === "ACTIVE")
      .map((allocation) => ({
        from: allocation.blockedFrom,
        until: allocation.blockedUntil,
        quantity: Math.max(0, allocation.quantity - allocation.issuedQuantity)
      })), input.from, input.until);
    const physicalOnHand = onHand._sum.quantity ?? 0;
    return {
      productName: product?.name ?? "—",
      size: size?.name || size?.code || "—",
      sku: variant.sku,
      physicalOnHand,
      issuedOutstanding,
      activeFleet: physicalOnHand + issuedOutstanding,
      cleaning: maintenance.cleaning,
      repair: maintenance.repair,
      plannedReservations,
      availableForInterval: availability.availableCapacity
    };
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });
}
