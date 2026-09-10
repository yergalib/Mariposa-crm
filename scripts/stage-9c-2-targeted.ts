import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { createTenantContext } from "../lib/tenant/context";
import { createPurchase, confirmPurchase, cancelPurchase } from "../lib/purchases/management";
import { closePartiallyReceivedPurchase, receivePurchaseItem } from "../lib/purchases/receipts";
import { getPurchase } from "../lib/purchases/queries";
import { PurchaseError } from "../lib/purchases/errors";
import { StaffError } from "../lib/staff/errors";
import { PermissionError } from "../lib/permissions/effective";

const organizations: string[] = [], users: string[] = [];
let passed = 0;
const ok = (name: string, condition: unknown) => { if (!condition) throw new Error(`FAIL ${name}`); passed++; };
const rejectsWith = async (fn: () => Promise<unknown>, matches: (error: unknown) => boolean) => {
  try { await fn(); return false; } catch (error) { if (!matches(error)) throw error; return true; }
};
const purchaseError = (code: PurchaseError["code"], message?: string) => (error: unknown) =>
  error instanceof PurchaseError && error.code === code && (!message || error.message === message);

async function cleanup() {
  if (!organizations.length) return;
  await db.$transaction(async (tx) => {
    for (const sql of [
      'ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_immutable_update"',
      'ALTER TABLE "inventory_movements" DISABLE TRIGGER "inventory_movements_immutable_update"',
      'ALTER TABLE "purchase_receipts" DISABLE TRIGGER "purchase_receipts_immutable"',
      'ALTER TABLE "purchase_receipt_lines" DISABLE TRIGGER "purchase_receipt_lines_immutable"',
      'ALTER TABLE "bulk_acquisition_layers" DISABLE TRIGGER "bulk_acquisition_layers_immutable"',
    ]) await tx.$executeRawUnsafe(sql);
    await tx.auditLog.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.inventoryMovement.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.productInstance.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.stockLevel.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.bulkAcquisitionLayer.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.purchaseReceiptLine.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.purchaseReceipt.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.purchase.updateMany({ where: { organizationId: { in: organizations } }, data: { status: "DRAFT", confirmedAt: null, cancelledAt: null, closedAt: null } });
    await tx.purchaseItem.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.purchase.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.supplier.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.purchaseCounter.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.membershipPermissionOverride.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.membershipBranchAccess.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.organizationMembership.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.location.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.productVariant.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.product.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.size.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.category.deleteMany({ where: { organizationId: { in: organizations } } });
    await tx.branch.deleteMany({ where: { organizationId: { in: organizations } } });
    for (const sql of [
      'ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_immutable_update"',
      'ALTER TABLE "inventory_movements" ENABLE TRIGGER "inventory_movements_immutable_update"',
      'ALTER TABLE "purchase_receipts" ENABLE TRIGGER "purchase_receipts_immutable"',
      'ALTER TABLE "purchase_receipt_lines" ENABLE TRIGGER "purchase_receipt_lines_immutable"',
      'ALTER TABLE "bulk_acquisition_layers" ENABLE TRIGGER "bulk_acquisition_layers_immutable"',
    ]) await tx.$executeRawUnsafe(sql);
    await tx.organization.deleteMany({ where: { id: { in: organizations } } });
    await tx.user.deleteMany({ where: { id: { in: users } } });
  }, { maxWait: 10000, timeout: 30000 });
  organizations.length = 0;
  users.length = 0;
}

async function main() {
  await cleanup();
  const orgId = randomUUID(), otherOrgId = randomUUID(), userId = randomUUID(), sellerId = randomUUID();
  organizations.push(orgId, otherOrgId); users.push(userId, sellerId);
  await db.organization.createMany({ data: [
    { id: orgId, name: "Stage 9C-2", slug: `stage-9c-2-${orgId.slice(0, 8)}` },
    { id: otherOrgId, name: "Stage 9C-2 other", slug: `stage-9c-2-other-${orgId.slice(0, 8)}` },
  ]});
  await db.user.createMany({ data: [
    { id: userId, email: `9c2-${orgId}@test.invalid`, displayName: "Owner", passwordHash: createHash("sha256").update(orgId).digest("hex") },
    { id: sellerId, email: `9c2-seller-${orgId}@test.invalid`, displayName: "Seller", passwordHash: createHash("sha256").update(sellerId).digest("hex") },
  ] });
  const branch = await db.branch.create({ data: { organizationId: orgId, name: "A", code: "A", city: "Test", timezone: "Asia/Qyzylorda" } });
  const branchB = await db.branch.create({ data: { organizationId: orgId, name: "B", code: "B", city: "Test", timezone: "Asia/Qyzylorda" } });
  const otherBranch = await db.branch.create({ data: { organizationId: otherOrgId, name: "X", code: "X", city: "Test", timezone: "Asia/Qyzylorda" } });
  const location = await db.location.create({ data: { organizationId: orgId, branchId: branch.id, name: "Main", code: "MAIN", type: "WAREHOUSE" } });
  const locationB = await db.location.create({ data: { organizationId: orgId, branchId: branchB.id, name: "Branch B", code: "B-WH", type: "WAREHOUSE" } });
  const otherLocation = await db.location.create({ data: { organizationId: otherOrgId, branchId: otherBranch.id, name: "Other", code: "OTHER", type: "WAREHOUSE" } });
  const membership = await db.organizationMembership.create({ data: { organizationId: orgId, userId, role: "OWNER", status: "ACTIVE", defaultBranchId: branch.id } });
  const sellerMembership = await db.organizationMembership.create({ data: { organizationId: orgId, userId: sellerId, role: "SELLER", status: "ACTIVE", defaultBranchId: branch.id } });
  await db.membershipBranchAccess.create({ data: { organizationId: orgId, membershipId: sellerMembership.id, branchId: branch.id } });
  const actor = { userId, membershipId: membership.id, role: "OWNER" as const }, sellerActor = { userId: sellerId, membershipId: sellerMembership.id, role: "SELLER" as const }, tenant = createTenantContext(orgId);
  const category = await db.category.create({ data: { organizationId: orgId, name: "Тест", slug: `test-${orgId}` } });
  const size = await db.size.create({ data: { organizationId: orgId, code: "M", name: "M", sortOrder: 1 } });
  const serializedProduct = await db.product.create({ data: { organizationId: orgId, categoryId: category.id, name: "Serialized", internalCode: `S-${orgId}`, trackingMode: "SERIALIZED", publicationStatus: "ACTIVE" } });
  const bulkProduct = await db.product.create({ data: { organizationId: orgId, categoryId: category.id, name: "Bulk", internalCode: `B-${orgId}`, trackingMode: "BULK", publicationStatus: "ACTIVE" } });
  const serialized = await db.productVariant.create({ data: { organizationId: orgId, productId: serializedProduct.id, sizeId: size.id, sku: `S-${orgId}` } });
  const bulk = await db.productVariant.create({ data: { organizationId: orgId, productId: bulkProduct.id, sizeId: size.id, sku: `B-${orgId}` } });
  const supplier = await db.supplier.create({ data: { organizationId: orgId, name: "Supplier" } });
  const before = { finance: await db.financialTransaction.count({ where: { organizationId: orgId } }), orders: await db.order.count({ where: { organizationId: orgId } }), allocations: await db.capacityAllocation.count({ where: { organizationId: orgId } }) };
  const create = async (key: string, variantId: string, quantity: number, total: bigint) => {
    const unit = (total + BigInt(quantity) - BigInt(1)) / BigInt(quantity);
    const p = await createPurchase(tenant, { supplierId: supplier.id, destinationBranchId: branch.id, currency: "KZT", additionalCostMinor: BigInt(0), idempotencyKey: key }, [{ productVariantId: variantId, orderedQuantity: quantity, unitCostMinor: unit, lineDiscountMinor: unit * BigInt(quantity) - total }], actor);
    await confirmPurchase(tenant, p.id, `${key}:confirm`, actor);
    return db.purchase.findUniqueOrThrow({ where: { id: p.id }, include: { items: true } });
  };
  const at = new Date("2026-09-10T09:00:00.000Z");
  const effects = async () => JSON.stringify(await db.$transaction([
    db.purchaseReceipt.count({ where: { organizationId: orgId } }),
    db.purchaseReceiptLine.count({ where: { organizationId: orgId } }),
    db.bulkAcquisitionLayer.count({ where: { organizationId: orgId } }),
    db.productInstance.count({ where: { organizationId: orgId } }),
    db.inventoryMovement.count({ where: { organizationId: orgId } }),
    db.stockLevel.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" } }),
    db.auditLog.count({ where: { organizationId: orgId } }),
    db.purchase.findMany({ where: { organizationId: orgId }, select: { id: true, status: true, version: true }, orderBy: { id: "asc" } }),
  ]));
  const serialPurchase = await create("serial", serialized.id, 3, BigInt(10001));
  ok("permission-first receive denial", await rejectsWith(() => receivePurchaseItem(tenant, { purchaseId: randomUUID(), purchaseItemId: randomUUID(), locationId: randomUUID(), quantity: 1, receivedAt: at, idempotencyKey: "denied" }, sellerActor), error => error instanceof PermissionError));
  await db.membershipPermissionOverride.createMany({ data: ["PURCHASE_RECEIVE", "PURCHASE_VIEW"].map(permissionKey => ({ organizationId: orgId, membershipId: sellerMembership.id, permissionKey, effect: "ALLOW" as const })) });
  ok("cross-branch location rejected", await rejectsWith(() => receivePurchaseItem(tenant, { purchaseId: serialPurchase.id, purchaseItemId: serialPurchase.items[0]!.id, locationId: locationB.id, quantity: 1, receivedAt: at, idempotencyKey: "branch-denied" }, sellerActor), purchaseError("NOT_FOUND", "Складская локация недоступна.")));
  const receipt = await receivePurchaseItem(tenant, { purchaseId: serialPurchase.id, purchaseItemId: serialPurchase.items[0]!.id, locationId: location.id, quantity: 3, receivedAt: at, note: "Приход", idempotencyKey: "serial-receipt" }, actor);
  const instances = await db.productInstance.findMany({ where: { purchaseReceiptLineId: receipt.lines[0]!.id }, orderBy: { inventoryNumber: "asc" } });
  ok("SERIALIZED instances created", instances.length === 3);
  ok("SERIALIZED exact cost split", instances.map(x => x.purchaseCostMinor?.toString()).join(",") === "3334,3334,3333");
  ok("SERIALIZED provenance", instances.every(x => x.purchaseItemId === serialPurchase.items[0]!.id && x.purchaseReceiptLineId === receipt.lines[0]!.id));
  ok("SERIALIZED identifiers", new Set(instances.map(x => x.inventoryNumber)).size === 3 && new Set(instances.map(x => x.barcode)).size === 3);
  ok("SERIALIZED movements", await db.inventoryMovement.count({ where: { sourceId: receipt.lines[0]!.id, type: "RECEIPT" } }) === 3);
  ok("SERIALIZED no StockLevel", await db.stockLevel.count({ where: { productVariantId: serialized.id } }) === 0);
  ok("fully received status", (await db.purchase.findUniqueOrThrow({ where: { id: serialPurchase.id } })).status === "RECEIVED");
  const replay = await receivePurchaseItem(tenant, { purchaseId: serialPurchase.id, purchaseItemId: serialPurchase.items[0]!.id, locationId: location.id, quantity: 3, receivedAt: at, note: "Приход", idempotencyKey: "serial-receipt" }, actor);
  ok("idempotent replay", replay.id === receipt.id && await db.purchaseReceipt.count({ where: { purchaseId: serialPurchase.id } }) === 1);
  ok("semantic collision", await rejectsWith(() => receivePurchaseItem(tenant, { purchaseId: serialPurchase.id, purchaseItemId: serialPurchase.items[0]!.id, locationId: location.id, quantity: 2, receivedAt: at, note: "Приход", idempotencyKey: "serial-receipt" }, actor), purchaseError("CONFLICT")));
  const bulkPurchase = await create("bulk", bulk.id, 10, BigInt(10001));
  const first = await receivePurchaseItem(tenant, { purchaseId: bulkPurchase.id, purchaseItemId: bulkPurchase.items[0]!.id, locationId: location.id, quantity: 4, receivedAt: at, idempotencyKey: "bulk-1" }, actor);
  ok("partial status", (await db.purchase.findUniqueOrThrow({ where: { id: bulkPurchase.id } })).status === "PARTIALLY_RECEIVED");
  ok("partial cumulative cost", first.lines[0]!.totalAcquisitionCostMinor === BigInt(4000));
  ok("BULK stock increment", (await db.stockLevel.findFirstOrThrow({ where: { productVariantId: bulk.id } })).quantity === 4);
  ok("BULK layer", !!first.lines[0]!.bulkLayer && first.lines[0]!.bulkLayer.totalCostMinor === BigInt(4000));
  ok("BULK one movement", await db.inventoryMovement.count({ where: { sourceId: first.lines[0]!.id, type: "RECEIPT" } }) === 1);
  ok("BULK no instances", await db.productInstance.count({ where: { productVariantId: bulk.id } }) === 0);
  const beforeGuards = await effects();
  ok("over receipt quantity guard on partial purchase", await rejectsWith(() => receivePurchaseItem(tenant, { purchaseId: bulkPurchase.id, purchaseItemId: bulkPurchase.items[0]!.id, locationId: location.id, quantity: 7, receivedAt: at, idempotencyKey: "bulk-over" }, actor), purchaseError("INVALID", "Количество превышает остаток по позиции закупки.")));
  ok("wrong tenant/location guard on partial purchase", await rejectsWith(() => receivePurchaseItem(tenant, { purchaseId: bulkPurchase.id, purchaseItemId: bulkPurchase.items[0]!.id, locationId: otherLocation.id, quantity: 1, receivedAt: at, idempotencyKey: "foreign" }, actor), purchaseError("NOT_FOUND", "Складская локация недоступна.")));
  ok("quantity/location rejection has no effects", await effects() === beforeGuards);
  const second = await receivePurchaseItem(tenant, { purchaseId: bulkPurchase.id, purchaseItemId: bulkPurchase.items[0]!.id, locationId: location.id, quantity: 6, receivedAt: at, idempotencyKey: "bulk-2" }, actor);
  ok("last receipt closes exact cost", second.lines[0]!.totalAcquisitionCostMinor === BigInt(6001) && first.lines[0]!.totalAcquisitionCostMinor + second.lines[0]!.totalAcquisitionCostMinor === BigInt(10001));
  ok("BULK received", (await db.stockLevel.findFirstOrThrow({ where: { productVariantId: bulk.id } })).quantity === 10 && (await db.purchase.findUniqueOrThrow({ where: { id: bulkPurchase.id } })).status === "RECEIVED");
  ok("cancel after receipt rejected", await rejectsWith(() => cancelPurchase(tenant, serialPurchase.id, "cancel-received", actor), purchaseError("INVALID_STATE")));
  const revokePurchase = await create("revoke", serialized.id, 1, BigInt(1000));
  const revokeInput = { purchaseId: revokePurchase.id, purchaseItemId: revokePurchase.items[0]!.id, locationId: location.id, quantity: 1, receivedAt: at, idempotencyKey: "revoke-receipt" };
  const sellerReceipt = await receivePurchaseItem(tenant, revokeInput, sellerActor);
  ok("authorized employee replay", (await receivePurchaseItem(tenant, revokeInput, sellerActor)).id === sellerReceipt.id);
  const beforeRevoke = await effects();
  await db.membershipBranchAccess.deleteMany({ where: { organizationId: orgId, membershipId: sellerMembership.id, branchId: branch.id } });
  const branchDenied = (error: unknown) => error instanceof StaffError && error.code === "NOT_FOUND" && error.message === "Ресурс недоступен.";
  ok("replay after branch revoke denied by branch authorization", await rejectsWith(() => receivePurchaseItem(tenant, revokeInput, sellerActor), branchDenied));
  ok("unauthorized semantic collision does not disclose receipt", await rejectsWith(() => receivePurchaseItem(tenant, { ...revokeInput, quantity: 2 }, sellerActor), branchDenied));
  ok("unauthorized missing key has same branch denial", await rejectsWith(() => receivePurchaseItem(tenant, { ...revokeInput, idempotencyKey: "absent-replay" }, sellerActor), branchDenied));
  ok("revoked replay has no receipt/inventory/audit effects", await effects() === beforeRevoke);
  await db.membershipBranchAccess.create({ data: { organizationId: orgId, membershipId: sellerMembership.id, branchId: branch.id } });
  ok("replay after branch access restored", (await receivePurchaseItem(tenant, revokeInput, sellerActor)).id === sellerReceipt.id);
  const collisionA = await create("collision-a", bulk.id, 5, BigInt(5000));
  const collisionB = await create("collision-b", bulk.id, 5, BigInt(5000));
  const collisionInput = (p: typeof collisionA) => ({ purchaseId: p.id, purchaseItemId: p.items[0]!.id, locationId: location.id, quantity: 5, receivedAt: at, idempotencyKey: "cross-purchase-receipt" });
  const stockBeforeCollision = (await db.stockLevel.findFirstOrThrow({ where: { productVariantId: bulk.id } })).quantity;
  const collision = await Promise.allSettled([receivePurchaseItem(tenant, collisionInput(collisionA), actor), receivePurchaseItem(tenant, collisionInput(collisionB), actor)]);
  const winner = collision.find(x => x.status === "fulfilled"), loser = collision.find(x => x.status === "rejected");
  ok("cross-purchase concurrent key collision is domain CONFLICT", !!winner && loser?.status === "rejected" && purchaseError("CONFLICT", "Ключ операции уже использован с другими данными.")(loser.reason));
  const collisionPurchases = await db.purchase.findMany({ where: { id: { in: [collisionA.id, collisionB.id] } }, include: { receipts: { include: { lines: { include: { bulkLayer: true, instances: true } } } } } });
  const posted = collisionPurchases.find(p => p.status === "RECEIVED"), untouched = collisionPurchases.find(p => p.status === "CONFIRMED");
  ok("cross-purchase collision rolls back losing transaction", !!posted && !!untouched && untouched.version === collisionA.version && untouched.receipts.length === 0 && posted.receipts.length === 1 && posted.receipts[0]!.lines.length === 1 && !!posted.receipts[0]!.lines[0]!.bulkLayer && posted.receipts[0]!.lines[0]!.instances.length === 0 && await db.inventoryMovement.count({ where: { organizationId: orgId, idempotencyKey: "cross-purchase-receipt:bulk" } }) === 1 && await db.auditLog.count({ where: { organizationId: orgId, action: "PURCHASE_RECEIPT_CREATED", correlationId: "cross-purchase-receipt" } }) === 1 && (await db.stockLevel.findFirstOrThrow({ where: { productVariantId: bulk.id } })).quantity === stockBeforeCollision + 5);
  const losingPurchase = untouched!.id === collisionA.id ? collisionA : collisionB;
  const beforeCollisionRetry = await effects();
  ok("cross-purchase existing key collision is domain CONFLICT", await rejectsWith(() => receivePurchaseItem(tenant, collisionInput(losingPurchase), actor), purchaseError("CONFLICT")));
  ok("cross-purchase collision retry has no effects", await effects() === beforeCollisionRetry);
  const racePurchase = await create("race", bulk.id, 5, BigInt(5000));
  const raceInput = (key: string) => receivePurchaseItem(tenant, { purchaseId: racePurchase.id, purchaseItemId: racePurchase.items[0]!.id, locationId: location.id, quantity: 5, receivedAt: at, idempotencyKey: key }, actor);
  const race = await Promise.allSettled([raceInput("race-a"), raceInput("race-b")]);
  ok("concurrent over-receipt prevented", race.filter(x => x.status === "fulfilled").length === 1 && await db.purchaseReceipt.count({ where: { purchaseId: racePurchase.id } }) === 1);
  const closePurchase = await create("close", bulk.id, 10, BigInt(10000));
  await receivePurchaseItem(tenant, { purchaseId: closePurchase.id, purchaseItemId: closePurchase.items[0]!.id, locationId: location.id, quantity: 4, receivedAt: at, idempotencyKey: "close-receipt" }, actor);
  const closed = await closePartiallyReceivedPurchase(tenant, closePurchase.id, "Остаток не ожидается", "close-key", actor);
  ok("partial close", closed.status === "CLOSED" && closed.closeReason === "Остаток не ожидается");
  ok("close idempotency", (await closePartiallyReceivedPurchase(tenant, closePurchase.id, "Остаток не ожидается", "close-key", actor)).id === closed.id);
  ok("closed receipt rejected", await rejectsWith(() => receivePurchaseItem(tenant, { purchaseId: closePurchase.id, purchaseItemId: closePurchase.items[0]!.id, locationId: location.id, quantity: 1, receivedAt: at, idempotencyKey: "closed-receipt" }, actor), purchaseError("INVALID_STATE")));
  const dto = await getPurchase(tenant, closePurchase.id, actor);
  ok("receipt read model", dto.items[0]!.receiptLines.reduce((s, x) => s + x.quantity, 0) === 4);
  const hidden = await getPurchase(tenant, closePurchase.id, sellerActor);
  ok("sensitive receipt cost filtered", !hidden.costVisible && hidden.items[0]!.receiptLines.every(line => !("totalAcquisitionCostMinor" in line)));
  ok("audit attribution", await db.auditLog.count({ where: { organizationId: orgId, action: { in: ["PURCHASE_RECEIPT_CREATED", "PURCHASE_CLOSED"] }, actorMembershipId: membership.id, branchId: branch.id } }) >= 2);
  ok("other domains unchanged", await db.financialTransaction.count({ where: { organizationId: orgId } }) === before.finance && await db.order.count({ where: { organizationId: orgId } }) === before.orders && await db.capacityAllocation.count({ where: { organizationId: orgId } }) === before.allocations);
  await cleanup();
  ok("cleanup", await db.organization.count({ where: { slug: { startsWith: "stage-9c-2-" } } }) === 0);
  // Exercise the restored trigger using only new test rows, all rolled back.
  ok("immutable receipt protection active after cleanup", await rejectsWith(() => db.$transaction(async tx => {
    const probeId = randomUUID();
    await tx.organization.create({ data: { id: probeId, name: "Stage 9C-2 protection probe", slug: `stage-9c-2-${probeId}` } });
    const probeBranch = await tx.branch.create({ data: { organizationId: probeId, name: "Probe", code: "PROBE", city: "Test", timezone: "Asia/Qyzylorda" } });
    const probeLocation = await tx.location.create({ data: { organizationId: probeId, branchId: probeBranch.id, name: "Probe", code: "PROBE", type: "WAREHOUSE" } });
    const probeSupplier = await tx.supplier.create({ data: { organizationId: probeId, name: "Probe" } });
    const probePurchase = await tx.purchase.create({ data: { organizationId: probeId, supplierId: probeSupplier.id, destinationBranchId: probeBranch.id, purchaseNumber: "PROBE", currency: "KZT", creationIdempotencyKey: "probe" } });
    const probeReceipt = await tx.purchaseReceipt.create({ data: { organizationId: probeId, purchaseId: probePurchase.id, branchId: probeBranch.id, locationId: probeLocation.id, receiptNumber: "PROBE-R001", receivedAt: at, idempotencyKey: "probe" } });
    await tx.purchaseReceipt.update({ where: { id: probeReceipt.id }, data: { note: "mutation-must-fail" } });
    throw new Error("Immutable receipt protection missing");
  }, { maxWait: 10000, timeout: 30000 }), error => error instanceof Error && error.message.includes("purchase receipt history is immutable")));
  ok("protection probe rolled back without fixtures", await db.organization.count({ where: { slug: { startsWith: "stage-9c-2-" } } }) === 0 && await db.user.count({ where: { id: { in: [userId, sellerId] } } }) === 0);
  const triggers = await db.$queryRaw<Array<{ name:string; enabled:string }>>`SELECT tgname name,tgenabled::text enabled FROM pg_trigger WHERE tgname IN ('audit_logs_immutable_update','inventory_movements_immutable_update','purchase_receipts_immutable','purchase_receipt_lines_immutable','bulk_acquisition_layers_immutable')`;
  ok("immutable triggers restored", triggers.length === 5 && triggers.every(x => x.enabled === "O"));
  const security = await db.$queryRaw<Array<{ tables:number; rls:number; anon:number; authenticated:number; policies:number }>>`SELECT (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) tables,(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) rls,(SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') anon,(SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated') authenticated,(SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND roles && ARRAY['anon','authenticated','public']::name[]) policies`;
  ok("RLS/security after cleanup", security[0]!.tables === 50 && security[0]!.rls === 50 && security[0]!.anon === 0 && security[0]!.authenticated === 0 && security[0]!.policies === 0);
  console.log("Security", security[0], "immutable triggers", triggers.length, "fixtures", 0);
  console.log(`PASS Stage 9C-2 (${passed} checks)`);
}
main().finally(async () => { await cleanup(); await db.$disconnect(); }).catch((error) => { console.error(error); process.exitCode = 1; });
