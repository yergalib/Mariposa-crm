import "dotenv/config";

import { db } from "../lib/db";
import { getProductEconomics } from "../lib/catalog/economics";
import { getCatalogManagementOptions, getCatalogProductById } from "../lib/catalog/queries";
import { createTenantContext } from "../lib/tenant/context";

const PILOT_PRODUCTS = [
  "Платье 5380",
  "Платье 2366 Mariposa рукав",
  "Платье белое",
  "Туфли N01 лакированные",
  "Туфли тканевые Yingerxie",
  "Такия красная",
  "Свечка-цифра",
  "Атомайзер",
  "Колечко",
  "Платье LAN 008"
] as const;

const passed: string[] = [];
function pass(name: string, condition: unknown) {
  if (!condition) throw new Error(`FAIL ${name}`);
  passed.push(name);
}

async function renderDetailPath(organizationId: string, membershipId: string, role: "OWNER", defaultBranchId: string | null, productId: string) {
  const tenant = createTenantContext(organizationId);
  const product = await getCatalogProductById({ tenant, defaultBranchId, productId });
  if (!product) throw new Error(`Product detail not found: ${productId}`);
  await getCatalogManagementOptions(tenant);
  await getProductEconomics(tenant, productId, { membershipId, role });
  return product;
}

async function main() {
  const pilot = await db.organization.findUniqueOrThrow({ where: { slug: "mariposa-pilot" }, select: { id: true } });
  const membership = await db.organizationMembership.findFirstOrThrow({
    where: { organizationId: pilot.id, status: "ACTIVE", role: "OWNER" },
    select: { id: true, userId: true, defaultBranchId: true }
  });
  const rows = await db.product.findMany({
    where: { organizationId: pilot.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });
  pass("pilot has exactly ten products", rows.length === 10);
  pass("pilot product names are exact", PILOT_PRODUCTS.every((name) => rows.some((row) => row.name === name)));

  const details = new Map<string, Awaited<ReturnType<typeof getCatalogProductById>>>();
  for (const name of PILOT_PRODUCTS) {
    const row = rows.find((candidate) => candidate.name === name)!;
    const detail = await renderDetailPath(pilot.id, membership.id, "OWNER", membership.defaultBranchId, row.id);
    details.set(name, detail);
    pass(`detail renders: ${name}`, detail.name === name);
  }

  const dress5380 = details.get("Платье 5380")!;
  pass("multiple executions render", dress5380.executions.length === 3 && dress5380.variants.every((variant) => variant.execution !== null));
  const repeated = new Map<string, Set<string>>();
  for (const variant of dress5380.variants) {
    const executions = repeated.get(variant.size.code) ?? new Set<string>();
    if (variant.execution) executions.add(variant.execution.id);
    repeated.set(variant.size.code, executions);
  }
  pass("repeated size codes across executions render", [...repeated.values()].some((executions) => executions.size > 1));
  pass("product without execution renders", details.get("Платье белое")!.executions.length === 0 && details.get("Платье белое")!.variants.every((variant) => variant.execution === null));
  const ringVariantIds = details.get("Колечко")!.variants.map((variant) => variant.id);
  const oneSizeCount = await db.productVariant.count({ where: { id: { in: ringVariantIds }, size: { sizeSystem: "ONE_SIZE" } } });
  pass("ONE_SIZE renders", ringVariantIds.length === 1 && oneSizeCount === 1);

  const dress2366Id = rows.find((row) => row.name === "Платье 2366 Mariposa рукав")!.id;
  const manufacturerMappings = await db.size.findMany({ where: { organizationId: pilot.id, recommendedHeightCm: { not: null }, variants: { some: { productId: dress2366Id } } }, select: { code: true, recommendedHeightCm: true } });
  pass("recommendedHeightCm preserved", manufacturerMappings.some((size) => size.code === "5" && size.recommendedHeightCm === 104) && manufacturerMappings.some((size) => size.code === "15" && size.recommendedHeightCm === 150));
  const yingerxieId = rows.find((row) => row.name === "Туфли тканевые Yingerxie")!.id;
  const lengthMappings = await db.size.findMany({ where: { organizationId: pilot.id, lengthCm: { not: null }, variants: { some: { productId: yingerxieId } } }, select: { code: true, lengthCm: true } });
  pass("lengthCm preserved", lengthMappings.some((size) => size.code === "2" && size.lengthCm === 11) && lengthMappings.some((size) => size.code === "3" && size.lengthCm === 13));

  const [executionCount, variantCount, stock, instanceCount] = await Promise.all([
    db.productExecution.count({ where: { organizationId: pilot.id } }),
    db.productVariant.count({ where: { organizationId: pilot.id } }),
    db.stockLevel.aggregate({ where: { organizationId: pilot.id }, _sum: { quantity: true } }),
    db.productInstance.count({ where: { organizationId: pilot.id } })
  ]);
  pass("pilot counts remain exact", executionCount === 13 && variantCount === 61 && stock._sum.quantity === 191 && instanceCount === 0);

  const legacyMembership = await db.organizationMembership.findFirst({
    where: { userId: membership.userId, organizationId: { not: pilot.id }, status: "ACTIVE", organization: { products: { some: {} } } },
    select: { id: true, organizationId: true, defaultBranchId: true }
  });
  if (!legacyMembership) throw new Error("No accessible legacy organization/product found for regression");
  const legacyProduct = await db.product.findFirstOrThrow({ where: { organizationId: legacyMembership.organizationId }, select: { id: true } });
  const legacyDetail = await renderDetailPath(legacyMembership.organizationId, legacyMembership.id, "OWNER", legacyMembership.defaultBranchId, legacyProduct.id);
  pass("legacy product detail renders", legacyDetail.variants.length > 0);

  console.log(`CATALOG PRODUCT DETAIL regression: ${passed.length}/${passed.length} passed`);
  console.log(passed);
}

main().finally(async () => db.$disconnect()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
