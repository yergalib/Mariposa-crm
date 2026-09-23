import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { InventoryError } from "@/lib/inventory/errors";

export async function getActiveBulkMaintenanceQuantity(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; branchId: string; productVariantId: string; locationId?: string | null }
) {
  const allocations = await tx.capacityAllocation.findMany({
    where: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      productVariantId: input.productVariantId,
      sourceType: "MAINTENANCE",
      productInstanceId: null,
      status: "ACTIVE",
      ...(input.locationId !== undefined ? { maintenanceLocationId: input.locationId } : {})
    },
    select: { quantity: true, bulkMaintenanceEvents: { select: { quantity: true } } }
  });
  return allocations.reduce((total, allocation) => total + Math.max(
    0,
    allocation.quantity - allocation.bulkMaintenanceEvents.reduce((sum, event) => sum + event.quantity, 0)
  ), 0);
}

export async function assertBulkMaintenanceStockFloor(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    branchId: string;
    productVariantId: string;
    locationId: string;
    resultingQuantity: number;
  }
) {
  const protectedQuantity = await getActiveBulkMaintenanceQuantity(tx, input);
  if (input.resultingQuantity < protectedQuantity) {
    throw new InventoryError("BLOCKED", "Операция затрагивает количество, заблокированное в чистке или ремонте.");
  }
}
