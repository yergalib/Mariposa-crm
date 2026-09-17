import "server-only";

import type { Prisma } from "@/generated/prisma/client";

export async function getActiveSaleCommitmentQuantity(tx: Prisma.TransactionClient, input: {
  organizationId: string; branchId: string; productVariantId: string;
}) {
  const row = await tx.saleInventoryCommitment.aggregate({
    where: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      productVariantId: input.productVariantId,
      status: "ACTIVE"
    },
    _sum: { quantity: true }
  });
  return row._sum.quantity ?? 0;
}

export async function assertBulkSaleCommitmentFloor(tx: Prisma.TransactionClient, input: {
  organizationId: string; branchId: string; productVariantId: string; resultingBranchOnHand: number;
}) {
  const committed = await getActiveSaleCommitmentQuantity(tx, input);
  if (input.resultingBranchOnHand < committed) throw new Error("Операция затронет товар, закреплённый за подтверждённой продажей.");
}

export async function assertInstanceNotSaleCommitted(tx: Prisma.TransactionClient, input: {
  organizationId: string; productInstanceId: string;
}) {
  const committed = await tx.saleInventoryCommitment.findFirst({
    where: { organizationId: input.organizationId, productInstanceId: input.productInstanceId, status: "ACTIVE" },
    select: { id: true }
  });
  if (committed) throw new Error("Экземпляр закреплён за подтверждённой продажей.");
}
