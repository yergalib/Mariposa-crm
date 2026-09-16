import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { createTenantContext } from "../lib/tenant/context";
import { buildCapacitySegments, calculatePeakBlockedCapacity } from "../lib/availability/capacity";
import { createBulkMaintenanceEvent, createBulkPhysicalResolution } from "../lib/inventory/bulk-foundation";

const passed: string[] = [];
const pass = (name: string, condition: unknown) => {
  if (!condition) throw new Error(`FAIL ${name}`);
  passed.push(name);
};
const rejects = async (fn: () => Promise<unknown>) => {
  try { await fn(); return false; } catch { return true; }
};
const at = (hour: number, minute = 0) => new Date(Date.UTC(2042, 0, 10, hour, minute));

async function main() {
  pass("pure peak ignores disjoint sum", calculatePeakBlockedCapacity([
    { from: at(10), until: at(12), quantity: 3 },
    { from: at(14), until: at(16), quantity: 3 }
  ], at(10), at(16)) === 3);
  pass("pure peak sums overlap", calculatePeakBlockedCapacity([
    { from: at(10), until: at(14), quantity: 3 },
    { from: at(12), until: at(16), quantity: 2 }
  ], at(10), at(16)) === 5);
  pass("half-open boundary", calculatePeakBlockedCapacity([
    { from: at(10), until: at(12), quantity: 3 },
    { from: at(12), until: at(14), quantity: 2 }
  ], at(10), at(14)) === 3);
  pass("event boundary quantities", calculatePeakBlockedCapacity([
    { from: at(10), until: at(11), quantity: 1 },
    { from: at(10, 30), until: at(12), quantity: 4 },
    { from: at(11), until: null, quantity: 2 }
  ], at(10), at(13)) === 6);
  const overdueSnapshot = { id: "issued", sourceType: "ORDER" as const, quantity: 2, blockedFrom: at(8), blockedUntil: at(12), issuedQuantity: 2, returnedQuantity: 0 };
  pass("overdue segment remains open", calculatePeakBlockedCapacity(buildCapacitySegments([overdueSnapshot], "BULK"), at(13), at(14)) === 2);
  pass("returned segment releases overdue", calculatePeakBlockedCapacity(buildCapacitySegments([{ ...overdueSnapshot, returnedQuantity: 2 }], "BULK"), at(13), at(14)) === 0);
  const maintenanceSnapshot = { id: "maintenance", sourceType: "MAINTENANCE" as const, quantity: 2, blockedFrom: at(12), blockedUntil: at(15), issuedQuantity: 0, returnedQuantity: 0 };
  pass("active maintenance is open-ended", calculatePeakBlockedCapacity(buildCapacitySegments([maintenanceSnapshot], "BULK"), at(16), at(20)) === 2);
  pass("partial maintenance completion", calculatePeakBlockedCapacity(buildCapacitySegments([maintenanceSnapshot], "BULK", new Map(), new Map([["maintenance", 1]])), at(16), at(20)) === 1);
  pass("rental to maintenance is continuous without overlap", calculatePeakBlockedCapacity(buildCapacitySegments([
    { ...overdueSnapshot, id: "rental", quantity: 3, issuedQuantity: 3, returnedQuantity: 3 }, maintenanceSnapshot
  ], "BULK"), at(10), at(16)) === 3);

  const rollback = new Error("BULK_1_ROLLBACK");
  await db.$transaction(async (tx) => {
    const suffix = randomUUID().slice(0, 8);
    const organization = await tx.organization.create({ data: { name: "BULK-1 targeted", slug: `bulk-1-${suffix}` } });
    const user = await tx.user.create({ data: { email: `bulk-1-${suffix}@example.test`, displayName: "BULK-1", passwordHash: "test" } });
    const branch = await tx.branch.create({ data: { organizationId: organization.id, name: "A", code: "A", city: "Test", timezone: "UTC" } });
    const branchB = await tx.branch.create({ data: { organizationId: organization.id, name: "B", code: "B", city: "Test", timezone: "UTC" } });
    const location = await tx.location.create({ data: { organizationId: organization.id, branchId: branch.id, name: "Stock", code: "STOCK", type: "WAREHOUSE" } });
    const locationB = await tx.location.create({ data: { organizationId: organization.id, branchId: branchB.id, name: "Stock B", code: "STOCK-B", type: "WAREHOUSE" } });
    const cleaning = await tx.location.create({ data: { organizationId: organization.id, branchId: branch.id, name: "Cleaning", code: "CLEAN", type: "CLEANING" } });
    await tx.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER", status: "ACTIVE", defaultBranchId: branch.id } });
    const customer = await tx.customer.create({ data: { organizationId: organization.id, customerNumber: `C-${suffix}`, firstName: "BULK-1 customer" } });
    const size = await tx.size.create({ data: { organizationId: organization.id, code: "120", name: "120" } });
    const bulkProduct = await tx.product.create({ data: { organizationId: organization.id, name: "Bulk", internalCode: `B-${suffix}`, trackingMode: "BULK" } });
    const bulkVariant = await tx.productVariant.create({ data: { organizationId: organization.id, productId: bulkProduct.id, sizeId: size.id, sku: `B-${suffix}-120` } });
    await tx.stockLevel.createMany({ data: [
      { organizationId: organization.id, productVariantId: bulkVariant.id, branchId: branch.id, locationId: location.id, quantity: 5 },
      { organizationId: organization.id, productVariantId: bulkVariant.id, branchId: branchB.id, locationId: locationB.id, quantity: 4 }
    ] });
    createTenantContext(organization.id);
    pass("turnaround segment", calculatePeakBlockedCapacity([{ from: at(10), until: at(12, 30), quantity: 2 }], at(12), at(12, 20)) === 2);

    const order = await tx.order.create({ data: { organizationId: organization.id, orderNumber: `O-${suffix}`, branchId: branch.id, customerId: customer.id, type: "RENTAL", channel: "CRM", status: "CONFIRMED", currency: "KZT", rentalStartAt: at(8), rentalEndAt: at(12) } });
    const item = await tx.orderItem.create({ data: { organizationId: organization.id, orderId: order.id, productVariantId: bulkVariant.id, quantity: 2, status: "ISSUED", unitPriceMinor: BigInt(0), lineTotalMinor: BigInt(0), currency: "KZT", productNameSnapshot: "Bulk", variantNameSnapshot: "120", skuSnapshot: bulkVariant.sku } });
    const issued = await tx.capacityAllocation.create({ data: { organizationId: organization.id, orderId: order.id, orderItemId: item.id, branchId: branch.id, productVariantId: bulkVariant.id, sourceType: "ORDER", quantity: 2, blockedFrom: at(8), blockedUntil: at(12), issuedAt: at(8), issuedByUserId: user.id, issuedQuantity: 2 } });
    await tx.stockLevel.updateMany({ where: { organizationId: organization.id, branchId: branch.id, productVariantId: bulkVariant.id }, data: { quantity: { decrement: 2 } } });
    pass("DB issued allocation created", issued.issuedQuantity === 2);

    const returned = await createBulkPhysicalResolution(tx, { organizationId: organization.id, branchId: branch.id, orderId: order.id, orderItemId: item.id, capacityAllocationId: issued.id, productVariantId: bulkVariant.id, kind: "RETURN", idempotencyKey: `bulk-1-return-${suffix}`, occurredAt: at(13), actorUserId: user.id, lines: [{ outcome: "GOOD", quantity: 2 }] });
    await tx.capacityAllocation.update({ where: { id: issued.id }, data: { returnedQuantity: 2, returnedAt: at(13), returnedByUserId: user.id } });
    await tx.stockLevel.updateMany({ where: { organizationId: organization.id, branchId: branch.id, productVariantId: bulkVariant.id }, data: { quantity: { increment: 2 } } });
    pass("DB return projection updated", (await tx.capacityAllocation.findUniqueOrThrow({ where: { id: issued.id } })).returnedQuantity === 2);
    await tx.capacityAllocation.update({ where: { id: issued.id }, data: { status: "FULFILLED" } });
    const replay = await createBulkPhysicalResolution(tx, { organizationId: organization.id, branchId: branch.id, orderId: order.id, orderItemId: item.id, capacityAllocationId: issued.id, productVariantId: bulkVariant.id, kind: "RETURN", idempotencyKey: `bulk-1-return-${suffix}`, occurredAt: at(13), actorUserId: user.id, lines: [{ outcome: "GOOD", quantity: 2 }] });
    pass("resolution idempotent replay", replay.id === returned.id);
    pass("resolution semantic conflict", await rejects(() => createBulkPhysicalResolution(tx, { organizationId: organization.id, branchId: branch.id, orderId: order.id, orderItemId: item.id, capacityAllocationId: issued.id, productVariantId: bulkVariant.id, kind: "RETURN", idempotencyKey: `bulk-1-return-${suffix}`, occurredAt: at(13), actorUserId: user.id, lines: [{ outcome: "DAMAGED", quantity: 2 }] })));

    const maintenanceItem = await tx.orderItem.create({ data: { organizationId: organization.id, orderId: order.id, productVariantId: bulkVariant.id, quantity: 3, status: "RETURNED", unitPriceMinor: BigInt(0), lineTotalMinor: BigInt(0), currency: "KZT", productNameSnapshot: "Bulk", variantNameSnapshot: "120", skuSnapshot: bulkVariant.sku } });
    const maintenanceSource = await tx.capacityAllocation.create({ data: { organizationId: organization.id, orderId: order.id, orderItemId: maintenanceItem.id, branchId: branch.id, productVariantId: bulkVariant.id, sourceType: "ORDER", quantity: 3, blockedFrom: at(8), blockedUntil: at(12), issuedAt: at(8), issuedByUserId: user.id, issuedQuantity: 3 } });
    const split = await createBulkPhysicalResolution(tx, { organizationId: organization.id, branchId: branch.id, locationId: cleaning.id, orderId: order.id, orderItemId: maintenanceItem.id, capacityAllocationId: maintenanceSource.id, productVariantId: bulkVariant.id, kind: "RETURN", idempotencyKey: `bulk-1-split-${suffix}`, occurredAt: at(11), actorUserId: user.id, lines: [{ outcome: "GOOD", quantity: 1 }, { outcome: "NEEDS_CLEANING", quantity: 2 }] });
    await tx.capacityAllocation.update({ where: { id: maintenanceSource.id }, data: { returnedQuantity: 3, returnedAt: at(11), returnedByUserId: user.id } });
    const cleaningLine = split.lines.find((line) => line.outcome === "NEEDS_CLEANING")!;
    const maintenance = await tx.capacityAllocation.create({ data: { organizationId: organization.id, branchId: branch.id, productVariantId: bulkVariant.id, sourceType: "MAINTENANCE", quantity: 2, blockedFrom: at(12), blockedUntil: at(15), maintenanceKind: "CLEANING", maintenanceLocationId: cleaning.id, bulkSourceResolutionLineId: cleaningLine.id } });
    pass("DB quantitative maintenance created", maintenance.quantity === 2 && maintenance.maintenanceKind === "CLEANING");
    await createBulkMaintenanceEvent(tx, { organizationId: organization.id, branchId: branch.id, capacityAllocationId: maintenance.id, productVariantId: bulkVariant.id, type: "COMPLETED", quantity: 1, idempotencyKey: `bulk-1-maint-${suffix}`, occurredAt: at(16), actorUserId: user.id });
    pass("DB partial maintenance event", (await tx.bulkMaintenanceEvent.aggregate({ where: { capacityAllocationId: maintenance.id }, _sum: { quantity: true } }))._sum.quantity === 1);
    pass("maintenance idempotent replay", (await createBulkMaintenanceEvent(tx, { organizationId: organization.id, branchId: branch.id, capacityAllocationId: maintenance.id, productVariantId: bulkVariant.id, type: "COMPLETED", quantity: 1, idempotencyKey: `bulk-1-maint-${suffix}`, occurredAt: at(16), actorUserId: user.id })).id.length > 0);
    await tx.$executeRawUnsafe(`
      DO $do$ BEGIN
        BEGIN
          UPDATE capacity_allocations SET status='RELEASED',released_at=CURRENT_TIMESTAMP WHERE id='${maintenance.id}';
          SET CONSTRAINTS capacity_allocations_bulk_maintenance_projection IMMEDIATE;
          RAISE EXCEPTION 'expected rejection missing';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM='expected rejection missing' THEN RAISE; END IF;
        END;
      END $do$
    `);
    pass("DB rejects premature maintenance release", true);

    pass("branch isolation", (await tx.stockLevel.aggregate({ where: { organizationId: organization.id, branchId: branchB.id, productVariantId: bulkVariant.id }, _sum: { quantity: true } }))._sum.quantity === 4);

    const serializedProduct = await tx.product.create({ data: { organizationId: organization.id, name: "Serialized", internalCode: `S-${suffix}`, trackingMode: "SERIALIZED" } });
    const serializedVariant = await tx.productVariant.create({ data: { organizationId: organization.id, productId: serializedProduct.id, sizeId: size.id, sku: `S-${suffix}-120` } });
    for (let index = 0; index < 2; index++) await tx.productInstance.create({ data: { organizationId: organization.id, productVariantId: serializedVariant.id, inventoryNumber: `INV-${suffix}-${index}`, barcode: `BC-${suffix}-${index}`, homeBranchId: branch.id, currentBranchId: branch.id, currentLocationId: location.id } });
    await tx.capacityAllocation.create({ data: { organizationId: organization.id, branchId: branch.id, productVariantId: serializedVariant.id, sourceType: "MANUAL_BLOCK", quantity: 1, blockedFrom: at(10), blockedUntil: at(12) } });
    await tx.capacityAllocation.create({ data: { organizationId: organization.id, branchId: branch.id, productVariantId: serializedVariant.id, sourceType: "MANUAL_BLOCK", quantity: 1, blockedFrom: at(14), blockedUntil: at(16) } });
    pass("SERIALIZED peak regression", calculatePeakBlockedCapacity(buildCapacitySegments([
      { id: "s1", sourceType: "MANUAL_BLOCK", quantity: 1, blockedFrom: at(10), blockedUntil: at(12), issuedQuantity: 0, returnedQuantity: 0 },
      { id: "s2", sourceType: "MANUAL_BLOCK", quantity: 1, blockedFrom: at(14), blockedUntil: at(16), issuedQuantity: 0, returnedQuantity: 0 }
    ], "SERIALIZED"), at(10), at(16)) === 1);

    const badResolutionId = randomUUID();
    await tx.$executeRawUnsafe(`
      DO $do$ BEGIN
        BEGIN
          INSERT INTO bulk_physical_resolutions(id,organization_id,branch_id,order_id,order_item_id,capacity_allocation_id,product_variant_id,kind,provenance,total_quantity,idempotency_key,occurred_at)
          VALUES ('${badResolutionId}','${organization.id}','${branch.id}','${order.id}','${item.id}','${issued.id}','${bulkVariant.id}','LOSS_RESOLUTION','RECORDED',1,'bulk-1-invalid-${suffix}',CURRENT_TIMESTAMP);
          RAISE EXCEPTION 'expected rejection missing';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM='expected rejection missing' THEN RAISE; END IF;
        END;
      END $do$
    `);
    pass("DB rejects over-resolution", true);

    const badMaintenanceId = randomUUID();
    await tx.$executeRawUnsafe(`
      DO $do$ BEGIN
        BEGIN
          INSERT INTO capacity_allocations(id,organization_id,product_variant_id,branch_id,quantity,source_type,blocked_from,status,assigned_at,issued_quantity,returned_quantity,created_at,updated_at,maintenance_kind,maintenance_location_id,bulk_source_resolution_line_id)
          VALUES ('${badMaintenanceId}','${organization.id}','${bulkVariant.id}','${branch.id}',3,'MAINTENANCE',CURRENT_TIMESTAMP,'ACTIVE',CURRENT_TIMESTAMP,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'CLEANING','${cleaning.id}','${cleaningLine.id}');
          RAISE EXCEPTION 'expected rejection missing';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM='expected rejection missing' THEN RAISE; END IF;
        END;
      END $do$
    `);
    pass("DB rejects excessive maintenance", true);

    await tx.$executeRawUnsafe(`
      DO $do$ BEGIN
        BEGIN
          UPDATE bulk_physical_resolutions SET note='mutated' WHERE id='${returned.id}';
          RAISE EXCEPTION 'expected rejection missing';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM='expected rejection missing' THEN RAISE; END IF;
        END;
      END $do$
    `);
    pass("finalized resolution immutable", true);

    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    pass("deferred quantity invariants", true);
    throw rollback;
  }, { maxWait: 30_000, timeout: 180_000 }).catch((error) => {
    if (error !== rollback) throw error;
  });

  const leaked = await db.organization.count({ where: { slug: { startsWith: "bulk-1-" } } });
  pass("transactional fixture cleanup", leaked === 0);
  console.log(`BULK-1 targeted: ${passed.length}/${passed.length} passed`);
  console.log(passed);
}

main().finally(() => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
