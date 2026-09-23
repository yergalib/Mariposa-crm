import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { addVariant, createProduct, updateProduct } from "../lib/catalog/management";
import { buildVariantSku, normalizeScannableCode } from "../lib/catalog/scannable-code";
import { classifyInventoryScan, resolveInventoryScan } from "../lib/inventory/scan";
import { createTenantContext } from "../lib/tenant/context";

const passed: string[] = [];
const pass = (name: string, condition: unknown) => { if (!condition) throw new Error(`FAIL ${name}`); passed.push(name); };
const rejects = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };
const productInput = (code: string, trackingMode?: "BULK" | "SERIALIZED") => ({ name: `Product ${code}`, internalCode: code, supplierModel: null, description: null, brand: null, categoryId: null, color: null, isRentable: true, isSellable: false, ...(trackingMode ? { trackingMode } : {}), publicationStatus: "ACTIVE" as const, turnaroundBufferMinutes: 0 });

async function cleanup(organizationIds: string[], userIds: string[]) {
  await db.stockLevel.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.productInstance.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.productVariant.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.product.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.size.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.membershipBranchAccess.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.organizationMembership.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.location.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.branch.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  const suffix = randomUUID().slice(0, 8), organizationIds: string[] = [], userIds: string[] = [];
  try {
    const organization = await db.organization.create({ data: { name: "BULK-4 targeted", slug: `bulk-4-${suffix}` } }); organizationIds.push(organization.id);
    const other = await db.organization.create({ data: { name: "BULK-4 other", slug: `bulk-4-other-${suffix}` } }); organizationIds.push(other.id);
    const user = await db.user.create({ data: { email: `bulk-4-${suffix}@example.test`, displayName: "BULK-4", passwordHash: "test" } }); userIds.push(user.id);
    const branch = await db.branch.create({ data: { organizationId: organization.id, name: "Main", code: "MAIN", city: "Test", timezone: "UTC" } });
    const location = await db.location.create({ data: { organizationId: organization.id, branchId: branch.id, name: "Stock", code: "STOCK", type: "WAREHOUSE" } });
    const membership = await db.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, role: "SELLER", status: "ACTIVE", defaultBranchId: branch.id } });
    const access = await db.membershipBranchAccess.create({ data: { organizationId: organization.id, membershipId: membership.id, branchId: branch.id } });
    const actor = { userId: user.id, membershipId: membership.id, role: "SELLER" as const };
    const tenant = createTenantContext(organization.id);
    const size110 = await db.size.create({ data: { organizationId: organization.id, code: "110", name: "110" } });
    const size120 = await db.size.create({ data: { organizationId: organization.id, code: "120", name: "120" } });

    pass("normalize preserves leading zeros", normalizeScannableCode(" 0060.120 ") === "0060.120");
    pass("SKU pattern", buildVariantSku("0060", "120") === "0060.120");
    pass("non-numeric size", buildVariantSku("0060", "One Size") === "0060.ONE SIZE");
    const bulk = await createProduct(tenant, productInput("0060"));
    pass("new product defaults BULK", bulk.trackingMode === "BULK");
    const serialized = await createProduct(tenant, productInput(`S-${suffix}`, "SERIALIZED"));
    pass("explicit SERIALIZED works", serialized.trackingMode === "SERIALIZED");
    pass("existing mode unchanged", (await db.product.findUniqueOrThrow({ where: { id: serialized.id } })).trackingMode === "SERIALIZED");
    const variant120 = await addVariant(tenant, { productId: bulk.id, sizeId: size120.id, sku: "" });
    pass("generated variant SKU", variant120.sku === "0060.120");
    const variant110 = await addVariant(tenant, { productId: bulk.id, sizeId: size110.id });
    pass("multiple sizes distinct", variant110.sku === "0060.110" && variant110.sku !== variant120.sku);
    pass("leading zeros persisted", (await db.productVariant.findUniqueOrThrow({ where: { id: variant120.id } })).sku.startsWith("0060"));
    pass("duplicate SKU rejected", await rejects(() => addVariant(tenant, { productId: bulk.id, sizeId: size110.id, sku: variant120.sku })));
    const manualProduct = await createProduct(tenant, productInput(`M-${suffix}`));
    const manual = await addVariant(tenant, { productId: manualProduct.id, sizeId: size120.id, sku: `manual.${suffix}` });
    pass("manual SKU retained canonically", manual.sku === `MANUAL.${suffix.toUpperCase()}`);
    pass("manual SKU not generated over", manual.sku !== buildVariantSku(manualProduct.internalCode, size120.code));
    const otherSize = await db.size.create({ data: { organizationId: other.id, code: "120", name: "120" } });
    const otherProduct = await db.product.create({ data: { organizationId: other.id, name: "Other", internalCode: "0060" } });
    await db.productVariant.create({ data: { organizationId: other.id, productId: otherProduct.id, sizeId: otherSize.id, sku: variant120.sku } });
    pass("tenant-safe SKU uniqueness", true);

    const bulkScan = await resolveInventoryScan(tenant, " 0060.120 ", actor, branch.id);
    pass("BULK SKU resolves", bulkScan?.kind === "BULK_VARIANT");
    pass("BULK scan returns variant", bulkScan?.variantId === variant120.id);
    pass("BULK scan returns product", bulkScan?.productId === bulk.id);
    pass("BULK scan returns size", bulkScan?.size === "120");
    pass("unknown scan is null", await resolveInventoryScan(tenant, "UNKNOWN", actor, branch.id) === null);
    pass("ambiguous candidates rejected", await rejects(async () => classifyInventoryScan({ id: "v" }, { id: "i" })));

    const serializedVariant = await addVariant(tenant, { productId: serialized.id, sizeId: size120.id, sku: `SV.${suffix}` });
    const instance = await db.productInstance.create({ data: { organizationId: organization.id, productVariantId: serializedVariant.id, inventoryNumber: `INV-${suffix}`, barcode: `BC-${suffix}`.toUpperCase(), homeBranchId: branch.id, currentBranchId: branch.id, currentLocationId: location.id } });
    const instanceScan = await resolveInventoryScan(tenant, instance.barcode, actor, branch.id);
    pass("SERIALIZED barcode resolves", instanceScan?.kind === "SERIALIZED_INSTANCE");
    pass("SERIALIZED scan exact identity", instanceScan?.kind === "SERIALIZED_INSTANCE" && instanceScan.instanceId === instance.id);
    pass("SERIALIZED instance mode unchanged", (await db.product.findUniqueOrThrow({ where: { id: serialized.id } })).trackingMode === "SERIALIZED");
    pass("cross-table collision rejected", await rejects(() => db.productVariant.create({ data: { organizationId: organization.id, productId: manualProduct.id, sizeId: size110.id, sku: instance.barcode } })));
    pass("inverse cross-table collision rejected", await rejects(() => db.productInstance.create({ data: { organizationId: organization.id, productVariantId: serializedVariant.id, inventoryNumber: `INV2-${suffix}`, barcode: variant120.sku, homeBranchId: branch.id, currentBranchId: branch.id, currentLocationId: location.id } })));

    await db.stockLevel.create({ data: { organizationId: organization.id, productVariantId: variant120.id, branchId: branch.id, locationId: location.id, quantity: 16 } });
    pass("BULK stock quantity sixteen", (await db.stockLevel.aggregate({ where: { productVariantId: variant120.id }, _sum: { quantity: true } }))._sum.quantity === 16);
    pass("BULK creates no instances", await db.productInstance.count({ where: { productVariantId: variant120.id } }) === 0);
    pass("unsafe service mode change rejected", await rejects(() => updateProduct(tenant, bulk.id, productInput("0060", "SERIALIZED"))));
    pass("unsafe direct mode change rejected", await rejects(() => db.product.update({ where: { id: bulk.id }, data: { trackingMode: "SERIALIZED" } })));
    pass("mode remains BULK", (await db.product.findUniqueOrThrow({ where: { id: bulk.id } })).trackingMode === "BULK");

    await db.membershipBranchAccess.delete({ where: { id: access.id } });
    pass("revoked branch blocks scan", await rejects(() => resolveInventoryScan(tenant, variant120.sku, actor, branch.id)));
    const restored = await db.membershipBranchAccess.create({ data: { organizationId: organization.id, membershipId: membership.id, branchId: branch.id } });
    await db.organizationMembership.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
    pass("inactive membership blocks scan", await rejects(() => resolveInventoryScan(tenant, variant120.sku, actor, branch.id)));
    await db.organizationMembership.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
    pass("authorization restored", (await resolveInventoryScan(tenant, variant120.sku, actor, branch.id))?.kind === "BULK_VARIANT");
    await db.membershipBranchAccess.delete({ where: { id: restored.id } });

    const defaultRow = await db.$queryRaw<Array<{ column_default: string }>>`SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='tracking_mode'`;
    pass("database default BULK", defaultRow[0]?.column_default.includes("BULK"));
    const triggerRows = await db.$queryRaw<Array<{ tgname: string; enabled: string }>>`SELECT tgname,tgenabled::text enabled FROM pg_trigger WHERE tgname IN ('products_tracking_mode_integrity','product_variants_scannable_code_integrity','product_instances_scannable_code_integrity')`;
    pass("three BULK-4 triggers installed", triggerRows.length === 3);
    pass("BULK-4 triggers enabled", triggerRows.every((row) => row.enabled === "O"));
    const collisions = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) n FROM product_variants v JOIN product_instances i ON i.organization_id=v.organization_id AND upper(btrim(i.barcode))=upper(btrim(v.sku))`;
    pass("existing scan collisions zero", collisions[0]?.n === BigInt(0));
    const rls = await db.$queryRaw<Array<{ total: bigint; enabled: bigint }>>`SELECT count(*) total,count(*) FILTER (WHERE relrowsecurity) enabled FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT LIKE '_prisma_%'`;
    pass("RLS all public tables", rls[0]?.total === rls[0]?.enabled);
    const anon = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) n FROM information_schema.table_privileges WHERE table_schema='public' AND grantee='anon'`;
    const authenticated = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) n FROM information_schema.table_privileges WHERE table_schema='public' AND grantee='authenticated'`;
    const policies = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) n FROM pg_policies WHERE schemaname='public' AND (roles::text LIKE '%anon%' OR roles::text LIKE '%authenticated%')`;
    pass("anon privileges zero", anon[0]?.n === BigInt(0));
    pass("authenticated privileges zero", authenticated[0]?.n === BigInt(0));
    pass("granting policies zero", policies[0]?.n === BigInt(0));
    const migrations = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    pass("migration count thirty-nine", migrations[0]?.n === BigInt(39));
    pass("scan result contains no sensitive finance", bulkScan && !("purchaseCostMinor" in bulkScan));
    pass("scan does not mutate inventory", (await db.stockLevel.findFirstOrThrow({ where: { productVariantId: variant120.id } })).quantity === 16);
    pass("scan does not create instances", await db.productInstance.count({ where: { productVariantId: variant120.id } }) === 0);
  } finally {
    await cleanup(organizationIds, userIds);
  }
  pass("fixtures cleaned", await db.organization.count({ where: { slug: { startsWith: "bulk-4-" } } }) === 0);
  console.log(`BULK-4 targeted: ${passed.length}/${passed.length} passed`);
  console.log(passed);
}

main().finally(() => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
