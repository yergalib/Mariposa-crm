import "server-only";

import { db } from "@/lib/db";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import type { TenantContext } from "@/lib/tenant/context";

export async function getRentalReturnIntake(tenant: TenantContext, orderId: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, organizationId: tenant.organizationId, type: "RENTAL" },
    select: {
      id: true, orderNumber: true, status: true, branchId: true,
      customer: { select: { firstName: true, lastName: true, customerNumber: true } },
      branch: { select: { name: true, timezone: true } },
      items: {
        where: { removedAt: null }, orderBy: { createdAt: "asc" },
        select: {
          id: true, status: true, quantity: true,
          productVariant: { select: { id: true, sku: true, product: { select: { name: true, trackingMode: true } }, execution: { select: { name: true } }, size: { select: { name: true, code: true } } } },
          capacityAllocations: {
            where: { sourceType: "ORDER", issuedAt: { not: null } }, orderBy: { createdAt: "asc" },
            select: { id: true, branchId: true, issuedQuantity: true, returnedQuantity: true, returnedAt: true, productInstanceId: true, productInstance: { select: { inventoryNumber: true, barcode: true, operationalStatus: true } }, bulkPhysicalResolutions: { where: { kind: "LOSS_RESOLUTION" }, select: { totalQuantity: true } } }
          }
        }
      }
    }
  });
  if (!order) throw new FulfillmentError("NOT_FOUND", "Аренда не найдена.");
  const items = order.items.flatMap((item) => item.capacityAllocations.map((allocation) => {
    const losses = allocation.bulkPhysicalResolutions.reduce((sum, row) => sum + row.totalQuantity, 0);
    const outstanding = allocation.issuedQuantity - allocation.returnedQuantity - losses;
    return {
      orderItemId: item.id, allocationId: allocation.id, branchId: allocation.branchId,
      productVariantId: item.productVariant.id, productName: item.productVariant.product.name,
      executionName: item.productVariant.execution?.name ?? null,
      sizeName: item.productVariant.size.name || item.productVariant.size.code,
      sku: item.productVariant.sku, trackingMode: item.productVariant.product.trackingMode,
      orderedQuantity: item.quantity, issuedQuantity: allocation.issuedQuantity,
      returnedQuantity: allocation.returnedQuantity, outstandingQuantity: outstanding,
      instance: allocation.productInstance ? { id: allocation.productInstanceId!, ...allocation.productInstance } : null
    };
  })).filter((item) => item.outstandingQuantity > 0);
  const locations = await db.location.findMany({ where: { organizationId: tenant.organizationId, branchId: order.branchId, isActive: true }, select: { id: true, name: true, type: true }, orderBy: { name: "asc" } });
  return { order: { id: order.id, orderNumber: order.orderNumber, status: order.status, branchId: order.branchId, branchName: order.branch.name, timeZone: order.branch.timezone, customerName: [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" "), customerNumber: order.customer.customerNumber }, items, locations };
}
