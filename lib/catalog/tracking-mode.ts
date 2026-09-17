import type { Prisma } from "@/generated/prisma/client";

type Client = Prisma.TransactionClient;

export async function hasProductOperationalHistory(tx: Client, organizationId: string, productId: string) {
  const variant = { productId, organizationId };
  if (await tx.productInstance.count({ where: { organizationId, productVariant: variant } })) return true;
  if (await tx.stockLevel.count({ where: { organizationId, productVariant: variant } })) return true;
  if (await tx.inventoryMovement.count({ where: { organizationId, productVariant: variant } })) return true;
  if (await tx.capacityAllocation.count({ where: { organizationId, productVariant: variant } })) return true;
  if (await tx.orderItem.count({ where: { organizationId, productVariant: variant } })) return true;
  if (await tx.purchaseItem.count({ where: { organizationId, productVariant: variant } })) return true;
  return Boolean(await tx.bulkAcquisitionLayer.count({ where: { organizationId, productVariant: variant } }));
}
