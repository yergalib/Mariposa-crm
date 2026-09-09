import "server-only";

import type { Prisma } from "@/generated/prisma/client";

export async function lockOrderFinance(
  tx: Prisma.TransactionClient,
  organizationId: string,
  orderId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId + ":order-finance:" + orderId},0))`;
}
