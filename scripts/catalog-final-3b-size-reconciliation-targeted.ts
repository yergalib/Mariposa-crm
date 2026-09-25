import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import type { FullCatalogPlan } from "../lib/catalog/full-import-planner";
import { reconcileCatalogImportSizes } from "../lib/catalog/full-import-size-resolution";

type PlannedSize = FullCatalogPlan["sizes"][number];
const rollback = new Error("CATALOG_SIZE_RECONCILIATION_ROLLBACK");
const passed: string[] = [];
const pass = (name: string, value: unknown) => { if (!value) throw new Error(`FAIL ${name}`); passed.push(name); };
const planned = (id: string, sizeSystem: string, code: string, overrides: Partial<PlannedSize> = {}): PlannedSize => ({ id, sizeSystem, code, name: code, recommendedHeightCm: null, lengthCm: null, ...overrides });

async function main() {
  try {
    await db.$transaction(async tx => {
      const suffix = randomUUID().slice(0, 8);
      const organization = await tx.organization.create({ data: { name: "Size reconciliation", slug: `size-reconciliation-${suffix}` } });
      const otherOrganization = await tx.organization.create({ data: { name: "Other size tenant", slug: `other-size-${suffix}` } });

      const newId = randomUUID();
      const created = await reconcileCatalogImportSizes(tx, [planned(newId, "ONE_SIZE", "ONE_SIZE", { name: "Без размера" })], organization.id);
      pass("A missing Size created with deterministic ID", created.get(newId) === newId && await tx.size.count({ where: { id: newId } }) === 1);

      const existing = await tx.size.create({ data: { organizationId: organization.id, sizeSystem: "HEIGHT_CM", code: "110", name: "110", sortOrder: 110 } });
      const plannedId = randomUUID();
      const compatible = await reconcileCatalogImportSizes(tx, [planned(plannedId, "HEIGHT_CM", "110", { name: "Рост 110 см" })], organization.id);
      pass("B compatible natural key reuses existing UUID", compatible.get(plannedId) === existing.id && await tx.size.count({ where: { organizationId: organization.id, sizeSystem: "HEIGHT_CM", code: "110" } }) === 1);

      const product = await tx.product.create({ data: { organizationId: organization.id, name: "Historical", internalCode: `H-${suffix}`, trackingMode: "SERIALIZED" } });
      const historicalVariant = await tx.productVariant.create({ data: { organizationId: organization.id, productId: product.id, sizeId: existing.id, sku: `H-${suffix}` } });
      const importedProduct = await tx.product.create({ data: { organizationId: organization.id, name: "Imported", internalCode: `I-${suffix}`, trackingMode: "BULK" } });
      const importedVariant = await tx.productVariant.create({ data: { organizationId: organization.id, productId: importedProduct.id, sizeId: compatible.get(plannedId)!, sku: `I-${suffix}` } });
      pass("C historical reference unchanged and imported variant shares resolved Size", (await tx.productVariant.findUniqueOrThrow({ where: { id: historicalVariant.id } })).sizeId === existing.id && importedVariant.sizeId === existing.id);

      let incompatible = false;
      try { await reconcileCatalogImportSizes(tx, [planned(randomUUID(), "HEIGHT_CM", "110", { recommendedHeightCm: 104 })], organization.id); } catch (error) { incompatible = error instanceof Error && error.message.includes("payload conflict"); }
      pass("D incompatible natural-key payload fails closed", incompatible);

      const shared = await reconcileCatalogImportSizes(tx, [planned(plannedId, "HEIGHT_CM", "110", { name: "Any display label" })], organization.id);
      pass("G multiple variants can share one resolved Size", shared.get(plannedId) === existing.id && importedVariant.sizeId === historicalVariant.sizeId);

      const other = await tx.size.create({ data: { organizationId: otherOrganization.id, sizeSystem: "DIGIT", code: "1", name: "1" } });
      const tenantPlannedId = randomUUID();
      const tenantResolved = await reconcileCatalogImportSizes(tx, [planned(tenantPlannedId, "DIGIT", "1")], organization.id);
      pass("H natural-key resolution is tenant scoped", tenantResolved.get(tenantPlannedId) === tenantPlannedId && tenantResolved.get(tenantPlannedId) !== other.id);
      throw rollback;
    }, { timeout: 120000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  console.log(`CATALOG FINAL-3B Size reconciliation: ${passed.length}/${passed.length} passed`);
  console.log(passed);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
