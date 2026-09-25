import type { Prisma } from "@/generated/prisma/client";
import type { FullCatalogPlan } from "@/lib/catalog/full-import-planner";

type PlannedSize = FullCatalogPlan["sizes"][number];
type ResolvedSize = {
  id: string;
  organizationId: string;
  sizeSystem: string;
  code: string;
  name: string;
  recommendedHeightCm: number | null;
  lengthCm: number | null;
  sortOrder: number;
  isActive: boolean;
};

const naturalKey = (sizeSystem: string, code: string) => `${sizeSystem}\u001f${code}`;

/**
 * Size identity is organization + sizeSystem + code. Name and sortOrder are
 * presentation metadata; UUID and timestamps are persistence metadata.
 * Advisory measurements and active state are material catalog semantics.
 */
export function assertCompatibleCatalogImportSize(existing: ResolvedSize, planned: PlannedSize, organizationId: string) {
  if (existing.organizationId !== organizationId
    || existing.sizeSystem !== planned.sizeSystem
    || existing.code !== planned.code
    || existing.recommendedHeightCm !== planned.recommendedHeightCm
    || existing.lengthCm !== planned.lengthCm
    || !existing.isActive) {
    throw new Error(`Size natural-key payload conflict: ${planned.sizeSystem}/${planned.code}`);
  }
}

export async function reconcileCatalogImportSizes(
  tx: Prisma.TransactionClient,
  sizes: FullCatalogPlan["sizes"],
  organizationId: string,
) {
  const existing = await tx.size.findMany({
    where: { organizationId },
    select: { id: true, organizationId: true, sizeSystem: true, code: true, name: true, recommendedHeightCm: true, lengthCm: true, sortOrder: true, isActive: true },
  });
  const byNaturalKey = new Map(existing.map(row => [naturalKey(row.sizeSystem, row.code), row]));
  const byId = new Map(existing.map(row => [row.id, row]));
  const resolved = new Map<string, string>();
  const creates: Array<{ id: string; organizationId: string; sizeSystem: string; code: string; name: string; recommendedHeightCm: number | null; lengthCm: number | null; sortOrder: number; isActive: boolean }> = [];

  for (const planned of sizes) {
    const match = byNaturalKey.get(naturalKey(planned.sizeSystem, planned.code));
    if (match) {
      assertCompatibleCatalogImportSize(match, planned, organizationId);
      resolved.set(planned.id, match.id);
      continue;
    }
    const idOwner = byId.get(planned.id);
    if (idOwner) throw new Error(`Size deterministic ID conflict: ${planned.id}`);
    creates.push({ id: planned.id, organizationId, sizeSystem: planned.sizeSystem, code: planned.code, name: planned.name, recommendedHeightCm: planned.recommendedHeightCm, lengthCm: planned.lengthCm, sortOrder: 0, isActive: true });
    resolved.set(planned.id, planned.id);
  }
  if (creates.length) await tx.size.createMany({ data: creates });
  return resolved;
}
