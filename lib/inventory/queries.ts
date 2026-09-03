import "server-only";

import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";

export const INVENTORY_STATUSES = [
  "AVAILABLE",
  "PICKING",
  "READY_FOR_PICKUP",
  "RENTED",
  "RETURN_INSPECTION",
  "CLEANING",
  "REPAIR",
  "IN_TRANSFER",
  "SOLD",
  "WRITTEN_OFF",
  "LOST"
] as const;

export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export type InventoryItemDto = {
  id: string;
  inventoryNumber: string;
  barcode: string;
  operationalStatus: InventoryStatus;
  conditionStatus: string;
  productId: string;
  productName: string;
  sku: string;
  size: string;
  branchName: string;
  locationName: string;
};

function cleanSearch(value?: string) {
  const search = value?.trim();
  return search ? search.slice(0, 100) : undefined;
}

export function parseInventoryStatus(value?: string): InventoryStatus | undefined {
  return INVENTORY_STATUSES.find((status) => status === value);
}

export async function getInventoryItems(input: {
  tenant: TenantContext;
  search?: string;
  status?: InventoryStatus;
  allowedBranchIds?: string[] | null;
}): Promise<InventoryItemDto[]> {
  const search = cleanSearch(input.search);
  const organizationId = input.tenant.organizationId;

  const instances = await db.productInstance.findMany({
    where: {
      organizationId,
      currentBranchId: input.allowedBranchIds ? { in: input.allowedBranchIds } : undefined,
      ...(input.status ? { operationalStatus: input.status } : {}),
      productVariant: {
        organizationId,
        size: { organizationId },
        product: { organizationId }
      },
      currentBranch: { organizationId },
      currentLocation: { organizationId },
      ...(search
        ? {
            OR: [
              { inventoryNumber: { contains: search, mode: "insensitive" } },
              { barcode: { contains: search, mode: "insensitive" } },
              { productVariant: { sku: { contains: search, mode: "insensitive" } } },
              { productVariant: { product: { name: { contains: search, mode: "insensitive" } } } }
            ]
          }
        : {})
    },
    select: {
      id: true,
      inventoryNumber: true,
      barcode: true,
      operationalStatus: true,
      conditionStatus: true,
      productVariant: {
        select: {
          sku: true,
          size: { select: { code: true } },
          product: { select: { id: true, name: true } }
        }
      },
      currentBranch: { select: { name: true } },
      currentLocation: { select: { name: true } }
    },
    orderBy: { inventoryNumber: "asc" },
    take: 250
  });

  return instances.map((instance) => ({
    id: instance.id,
    inventoryNumber: instance.inventoryNumber,
    barcode: instance.barcode,
    operationalStatus: instance.operationalStatus,
    conditionStatus: instance.conditionStatus,
    productId: instance.productVariant.product.id,
    productName: instance.productVariant.product.name,
    sku: instance.productVariant.sku,
    size: instance.productVariant.size.code,
    branchName: instance.currentBranch.name,
    locationName: instance.currentLocation.name
  }));
}
