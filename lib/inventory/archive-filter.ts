import type { Prisma } from "@/generated/prisma/client";

export type InventoryArchive = "current" | "archived";
export function parseInventoryArchive(value?: string): InventoryArchive {
  return value === "archived" ? "archived" : "current";
}
export function inventoryProductFilter(archive: InventoryArchive): Prisma.ProductWhereInput {
  return archive === "archived"
    ? { OR: [{ publicationStatus: "ARCHIVED" }, { archivedAt: { not: null } }] }
    : { publicationStatus: { not: "ARCHIVED" }, archivedAt: null };
}
