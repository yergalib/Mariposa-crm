import "server-only";

import type { Prisma } from "@/generated/prisma/client";

export function capacityLockKey(organizationId: string, branchId: string, productVariantId: string) {
  return `capacity:${organizationId}:${branchId}:${productVariantId}`;
}

export async function lockCapacityResource(
  tx: Prisma.TransactionClient,
  organizationId: string,
  branchId: string,
  productVariantId: string
) {
  const key = capacityLockKey(organizationId, branchId, productVariantId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function lockCapacityResources(
  tx: Prisma.TransactionClient,
  resources: Array<{ organizationId: string; branchId: string; productVariantId: string }>
) {
  const keys = [...new Set(resources.map((resource) => capacityLockKey(
    resource.organizationId,
    resource.branchId,
    resource.productVariantId
  )))].sort();
  for (const key of keys) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}

export async function lockInstanceResources(
  tx: Prisma.TransactionClient,
  organizationId: string,
  instanceIds: string[]
) {
  const keys = [...new Set(instanceIds.map((instanceId) => `${organizationId}:instance:${instanceId}`))].sort();
  for (const key of keys) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}
