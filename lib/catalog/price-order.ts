import type { Prisma } from "@/generated/prisma/client";

// Callers first restrict prices to the selected branch OR the organization default.
// PostgreSQL DESC puts NULL first unless explicitly overridden.
export const effectivePriceOrder: Prisma.ProductPriceOrderByWithRelationInput[] = [
  { branchId: { sort: "desc", nulls: "last" } },
  { validFrom: "desc" },
  { id: "desc" },
];
