import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { summarizeBulkState } from "@/lib/inventory/bulk-state-summary";

export async function warehouseStates(tx: Prisma.TransactionClient, organizationId: string, resources: Array<{ branchId: string; productVariantId: string; quantity: number }>, at: Date) {
  if (!resources.length) return [];
  const scope = { organizationId, OR: resources.map(({ branchId, productVariantId }) => ({ branchId, productVariantId })) };
  const orders = await tx.capacityAllocation.findMany({ where: { ...scope, sourceType: "ORDER", productInstanceId: null }, select: { id: true, branchId: true, productVariantId: true, quantity: true, issuedQuantity: true, returnedQuantity: true, status: true, blockedFrom: true, blockedUntil: true } });
  const maintenance = await tx.capacityAllocation.findMany({ where: { ...scope, sourceType: "MAINTENANCE", productInstanceId: null, status: "ACTIVE" }, select: { id: true, branchId: true, productVariantId: true, quantity: true, maintenanceKind: true } });
  const losses = await tx.bulkPhysicalResolution.groupBy({ by: ["capacityAllocationId"], where: { organizationId, kind: "LOSS_RESOLUTION", capacityAllocationId: { in: orders.map(row => row.id) } }, _sum: { totalQuantity: true } });
  const terminal = await tx.bulkMaintenanceEvent.groupBy({ by: ["capacityAllocationId"], where: { organizationId, capacityAllocationId: { in: maintenance.map(row => row.id) } }, _sum: { quantity: true } });
  const lossById = new Map(losses.map(row => [row.capacityAllocationId, row._sum.totalQuantity ?? 0]));
  const terminalById = new Map(terminal.map(row => [row.capacityAllocationId, row._sum.quantity ?? 0]));
  const until = new Date(at.getTime() + 1);
  return resources.map(resource => ({ ...resource, ...summarizeBulkState(resource.quantity,
    orders.filter(row => row.branchId === resource.branchId && row.productVariantId === resource.productVariantId),
    maintenance.filter(row => row.branchId === resource.branchId && row.productVariantId === resource.productVariantId), lossById, terminalById, at, until) }));
}
