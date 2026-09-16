import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { createTenantContext } from "../lib/tenant/context";
import { authorizeBulkOperation } from "../lib/fulfillment/bulk-authorization";
import { recordBulkReturn } from "../lib/fulfillment/bulk-returns";
import { completeBulkMaintenance, transitionBulkCleaningToRepair } from "../lib/fulfillment/bulk-maintenance";
import { buildCapacitySegments, calculatePeakBlockedCapacity } from "../lib/availability/capacity";
import { createBulkMaintenanceEvent, createBulkPhysicalResolution, validateBulkResolutionLines } from "../lib/inventory/bulk-foundation";
import { returnBulkDispositionInventory } from "../lib/inventory/ledger";
import { assertBulkMaintenanceStockFloor, getActiveBulkMaintenanceQuantity } from "../lib/inventory/bulk-maintenance-state";

const passed: string[] = [];
const pass = (name: string, value: unknown) => { if (!value) throw new Error(`FAIL ${name}`); passed.push(name); };
const rejects = async (operation: () => Promise<unknown>) => { try { await operation(); return false; } catch { return true; } };
const at = (hour: number) => new Date(Date.UTC(2044, 4, 10, hour));

async function main() {
  pass("peak availability regression", calculatePeakBlockedCapacity([
    { from: at(10), until: at(12), quantity: 3 }, { from: at(14), until: at(16), quantity: 3 }
  ], at(10), at(16)) === 3);
  pass("half-open availability regression", calculatePeakBlockedCapacity([
    { from: at(10), until: at(12), quantity: 3 }, { from: at(12), until: at(14), quantity: 2 }
  ], at(10), at(14)) === 3);

  const rollback = new Error("BULK_2_ROLLBACK");
  await db.$transaction(async (tx) => {
    const suffix = randomUUID().slice(0, 8);
    const organization = await tx.organization.create({ data: { name: "BULK-2 targeted", slug: `bulk-2-${suffix}` } });
    const user = await tx.user.create({ data: { email: `bulk-2-${suffix}@example.test`, displayName: "BULK-2", passwordHash: "test" } });
    const otherUser = await tx.user.create({ data: { email: `bulk-2-other-${suffix}@example.test`, displayName: "BULK-2 other", passwordHash: "test" } });
    const branch = await tx.branch.create({ data: { organizationId: organization.id, name: "A", code: "A", city: "Test", timezone: "UTC" } });
    const otherBranch = await tx.branch.create({ data: { organizationId: organization.id, name: "B", code: "B", city: "Test", timezone: "UTC" } });
    const stock = await tx.location.create({ data: { organizationId: organization.id, branchId: branch.id, name: "Stock", code: "STOCK", type: "WAREHOUSE" } });
    const cleaning = await tx.location.create({ data: { organizationId: organization.id, branchId: branch.id, name: "Cleaning", code: "CLEAN", type: "CLEANING" } });
    const repair = await tx.location.create({ data: { organizationId: organization.id, branchId: branch.id, name: "Repair", code: "REPAIR", type: "REPAIR" } });
    const membership = await tx.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER", status: "ACTIVE", defaultBranchId: branch.id } });
    const otherMembership = await tx.organizationMembership.create({ data: { organizationId: organization.id, userId: otherUser.id, role: "SELLER", status: "ACTIVE", defaultBranchId: branch.id } });
    await tx.membershipBranchAccess.create({ data: { organizationId: organization.id, membershipId: otherMembership.id, branchId: branch.id } });
    const customer = await tx.customer.create({ data: { organizationId: organization.id, customerNumber: `C-${suffix}`, firstName: "Fixture" } });
    const size = await tx.size.create({ data: { organizationId: organization.id, code: "120", name: "120" } });
    const product = await tx.product.create({ data: { organizationId: organization.id, name: "Белоснежка", internalCode: `B-${suffix}`, trackingMode: "BULK" } });
    const variant = await tx.productVariant.create({ data: { organizationId: organization.id, productId: product.id, sizeId: size.id, sku: `0060.120-${suffix}` } });
    await tx.stockLevel.create({ data: { organizationId: organization.id, productVariantId: variant.id, branchId: branch.id, locationId: stock.id, quantity: 11 } });
    const order = await tx.order.create({ data: { organizationId: organization.id, orderNumber: `O-${suffix}`, branchId: branch.id, customerId: customer.id, type: "RENTAL", channel: "CRM", status: "CONFIRMED", currency: "KZT", rentalStartAt: at(8), rentalEndAt: at(12) } });
    const item = await tx.orderItem.create({ data: { organizationId: organization.id, orderId: order.id, productVariantId: variant.id, quantity: 5, status: "ISSUED", unitPriceMinor: BigInt(0), lineTotalMinor: BigInt(0), currency: "KZT", productNameSnapshot: product.name, variantNameSnapshot: "120", skuSnapshot: variant.sku } });
    const allocation = await tx.capacityAllocation.create({ data: { organizationId: organization.id, orderId: order.id, orderItemId: item.id, branchId: branch.id, productVariantId: variant.id, sourceType: "ORDER", quantity: 5, blockedFrom: at(8), blockedUntil: at(12), issuedAt: at(8), issuedByUserId: user.id, issuedQuantity: 5 } });
    await tx.inventoryMovement.create({ data: { organizationId: organization.id, productVariantId: variant.id, type: "RENTAL_ISSUE", quantity: -5, fromBranchId: branch.id, fromLocationId: stock.id, sourceType: "CAPACITY_ALLOCATION", sourceId: allocation.id, idempotencyKey: `issue-${suffix}`, createdByUserId: user.id } });
    const tenant = createTenantContext(organization.id);
    const actor = { userId: user.id, membershipId: membership.id, role: "OWNER" as const };
    pass("active member authorized", Boolean(await authorizeBulkOperation(tx, tenant, actor, "RETURN_PROCESS", branch.id)));
    pass("branch isolation", await rejects(() => authorizeBulkOperation(tx, tenant, { userId: otherUser.id, membershipId: otherMembership.id, role: "SELLER" }, "RETURN_PROCESS", otherBranch.id)));

    const commandItem = await tx.orderItem.create({ data: { organizationId: organization.id, orderId: order.id, productVariantId: variant.id, quantity: 1, status: "ISSUED", unitPriceMinor: BigInt(0), lineTotalMinor: BigInt(0), currency: "KZT", productNameSnapshot: product.name, variantNameSnapshot: "120", skuSnapshot: variant.sku } });
    const commandAllocation = await tx.capacityAllocation.create({ data: { organizationId: organization.id, orderId: order.id, orderItemId: commandItem.id, branchId: branch.id, productVariantId: variant.id, sourceType: "ORDER", quantity: 1, blockedFrom: at(8), blockedUntil: at(12), issuedAt: at(8), issuedByUserId: user.id, issuedQuantity: 1 } });
    await tx.inventoryMovement.create({ data: { organizationId: organization.id, productVariantId: variant.id, type: "RENTAL_ISSUE", quantity: -1, fromBranchId: branch.id, fromLocationId: stock.id, sourceType: "CAPACITY_ALLOCATION", sourceId: commandAllocation.id, idempotencyKey: `command-issue-${suffix}`, createdByUserId: user.id } });
    await tx.stockLevel.updateMany({ where: { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id, locationId: stock.id }, data: { quantity: { decrement: 1 } } });
    const sellerActor = { userId: otherUser.id, membershipId: otherMembership.id, role: "SELLER" as const };
    const commandResult = await recordBulkReturn(tenant, { orderId: order.id, orderItemId: commandItem.id, allocationId: commandAllocation.id, idempotencyKey: `command-return-${suffix}`, dispositions: [{ outcome: "GOOD", quantity: 1, locationId: stock.id }] }, sellerActor, tx);
    pass("production return command succeeds", commandResult.returnedQuantity === 1 && commandResult.outstandingAfter === 0);
    const commandReplay = await recordBulkReturn(tenant, { orderId: order.id, orderItemId: commandItem.id, allocationId: commandAllocation.id, idempotencyKey: `command-return-${suffix}`, dispositions: [{ outcome: "GOOD", quantity: 1, locationId: stock.id }] }, sellerActor, tx);
    pass("production return replay succeeds", commandReplay.resolutionId === commandResult.resolutionId);
    pass("production return semantic conflict", await rejects(() => recordBulkReturn(tenant, { orderId: order.id, orderItemId: commandItem.id, allocationId: commandAllocation.id, idempotencyKey: `command-return-${suffix}`, dispositions: [{ outcome: "DAMAGED", quantity: 1, locationId: repair.id }] }, sellerActor, tx)));
    await tx.membershipBranchAccess.deleteMany({ where: { membershipId: otherMembership.id } });
    pass("authorization checked before command replay", await rejects(() => recordBulkReturn(tenant, { orderId: order.id, orderItemId: commandItem.id, allocationId: commandAllocation.id, idempotencyKey: `command-return-${suffix}`, dispositions: [{ outcome: "GOOD", quantity: 1, locationId: stock.id }] }, sellerActor, tx)));
    await tx.membershipBranchAccess.create({ data: { organizationId: organization.id, membershipId: otherMembership.id, branchId: branch.id } });
    pass("return command writes audit", await tx.auditLog.count({ where: { organizationId: organization.id, entityId: commandResult.resolutionId } }) === 1);
    pass("return creates no finance transaction", await tx.financialTransaction.count({ where: { organizationId: organization.id } }) === 0);
    pass("rental issue provenance retained for economics", await tx.inventoryMovement.count({ where: { organizationId: organization.id, sourceId: commandAllocation.id, type: "RENTAL_ISSUE" } }) === 1);

    const maintenanceCommandItem = await tx.orderItem.create({ data: { organizationId: organization.id, orderId: order.id, productVariantId: variant.id, quantity: 2, status: "ISSUED", unitPriceMinor: BigInt(0), lineTotalMinor: BigInt(0), currency: "KZT", productNameSnapshot: product.name, variantNameSnapshot: "120", skuSnapshot: variant.sku } });
    const maintenanceCommandAllocation = await tx.capacityAllocation.create({ data: { organizationId: organization.id, orderId: order.id, orderItemId: maintenanceCommandItem.id, branchId: branch.id, productVariantId: variant.id, sourceType: "ORDER", quantity: 2, blockedFrom: at(8), blockedUntil: at(12), issuedAt: at(8), issuedByUserId: user.id, issuedQuantity: 2 } });
    await tx.inventoryMovement.create({ data: { organizationId: organization.id, productVariantId: variant.id, type: "RENTAL_ISSUE", quantity: -2, fromBranchId: branch.id, fromLocationId: stock.id, sourceType: "CAPACITY_ALLOCATION", sourceId: maintenanceCommandAllocation.id, idempotencyKey: `maintenance-command-issue-${suffix}`, createdByUserId: user.id } });
    await tx.stockLevel.updateMany({ where: { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id, locationId: stock.id }, data: { quantity: { decrement: 2 } } });
    const maintenanceReturn = await recordBulkReturn(tenant, { orderId: order.id, orderItemId: maintenanceCommandItem.id, allocationId: maintenanceCommandAllocation.id, idempotencyKey: `maintenance-command-return-${suffix}`, occurredAt: at(13), dispositions: [{ outcome: "NEEDS_CLEANING", quantity: 2, locationId: cleaning.id }] }, actor, tx);
    const maintenanceCommandId = maintenanceReturn.dispositions[0]?.maintenanceAllocationId;
    pass("production cleaning allocation created", Boolean(maintenanceCommandId));
    const stockBeforeMaintenanceCommands = (await tx.stockLevel.aggregate({ where: { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id }, _sum: { quantity: true } }))._sum.quantity;
    const partialCompletion = await completeBulkMaintenance(tenant, { allocationId: maintenanceCommandId!, quantity: 1, destinationLocationId: stock.id, idempotencyKey: `maintenance-command-complete-${suffix}`, occurredAt: at(14) }, actor, tx);
    pass("production partial maintenance completion", partialCompletion.remainingQuantity === 1);
    const partialReplay = await completeBulkMaintenance(tenant, { allocationId: maintenanceCommandId!, quantity: 1, destinationLocationId: stock.id, idempotencyKey: `maintenance-command-complete-${suffix}`, occurredAt: at(15) }, actor, tx);
    pass("production maintenance replay", partialReplay.eventId === partialCompletion.eventId);
    const transition = await transitionBulkCleaningToRepair(tenant, { allocationId: maintenanceCommandId!, quantity: 1, repairLocationId: repair.id, idempotencyKey: `maintenance-command-transition-${suffix}`, occurredAt: at(14) }, actor, tx);
    pass("production cleaning to repair transition", transition.remainingCleaningQuantity === 0);
    pass("production transition child active", (await tx.capacityAllocation.findUniqueOrThrow({ where: { id: transition.repairAllocationId } })).status === "ACTIVE");
    pass("maintenance commands preserve branch stock", (await tx.stockLevel.aggregate({ where: { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id }, _sum: { quantity: true } }))._sum.quantity === stockBeforeMaintenanceCommands);

    const resolution = await createBulkPhysicalResolution(tx, {
      organizationId: organization.id, branchId: branch.id, orderId: order.id, orderItemId: item.id,
      capacityAllocationId: allocation.id, productVariantId: variant.id, kind: "RETURN", provenance: "RECORDED",
      idempotencyKey: `return-${suffix}`, occurredAt: at(13), actorUserId: user.id,
      lines: [{ outcome: "GOOD", quantity: 2 }, { outcome: "NEEDS_CLEANING", quantity: 2 }, { outcome: "DAMAGED", quantity: 1 }]
    });
    pass("one return header", resolution.totalQuantity === 5);
    pass("split has three outcomes", resolution.lines.length === 3);
    pass("GOOD quantity", resolution.lines.find((line) => line.outcome === "GOOD")?.quantity === 2);
    pass("CLEANING quantity", resolution.lines.find((line) => line.outcome === "NEEDS_CLEANING")?.quantity === 2);
    pass("DAMAGED quantity", resolution.lines.find((line) => line.outcome === "DAMAGED")?.quantity === 1);
    let offset = 0;
    for (const [outcome, locationId] of [["GOOD", stock.id], ["NEEDS_CLEANING", cleaning.id], ["DAMAGED", repair.id]] as const) {
      const line = resolution.lines.find((candidate) => candidate.outcome === outcome)!;
      await returnBulkDispositionInventory(tx, { organizationId: organization.id, branchId: branch.id, locationId, variantId: variant.id, allocationId: allocation.id, fromReturned: offset, quantity: line.quantity, userId: user.id, resolutionLineId: line.id });
      offset += line.quantity;
    }
    await tx.capacityAllocation.update({ where: { id: allocation.id }, data: { returnedQuantity: 5, returnedAt: at(13), returnedByUserId: user.id } });
    pass("physical stock increased by five", (await tx.stockLevel.aggregate({ where: { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id }, _sum: { quantity: true } }))._sum.quantity === 16);
    pass("three return movements", await tx.inventoryMovement.count({ where: { bulkResolutionLineId: { in: resolution.lines.map((line) => line.id) } } }) === 3);
    pass("idempotent resolution replay", (await createBulkPhysicalResolution(tx, { organizationId: organization.id, branchId: branch.id, orderId: order.id, orderItemId: item.id, capacityAllocationId: allocation.id, productVariantId: variant.id, kind: "RETURN", provenance: "RECORDED", idempotencyKey: `return-${suffix}`, occurredAt: at(14), actorUserId: user.id, lines: [{ outcome: "GOOD", quantity: 2 }, { outcome: "NEEDS_CLEANING", quantity: 2 }, { outcome: "DAMAGED", quantity: 1 }] })).id === resolution.id);
    pass("idempotency conflict", await rejects(() => createBulkPhysicalResolution(tx, { organizationId: organization.id, branchId: branch.id, orderId: order.id, orderItemId: item.id, capacityAllocationId: allocation.id, productVariantId: variant.id, kind: "RETURN", idempotencyKey: `return-${suffix}`, occurredAt: at(14), actorUserId: user.id, lines: [{ outcome: "GOOD", quantity: 5 }] })));
    await tx.$executeRawUnsafe(`DO $do$ BEGIN BEGIN INSERT INTO bulk_physical_resolutions(organization_id,branch_id,order_id,order_item_id,capacity_allocation_id,product_variant_id,kind,provenance,total_quantity,idempotency_key,occurred_at) VALUES ('${organization.id}','${branch.id}','${order.id}','${item.id}','${allocation.id}','${variant.id}','RETURN','RECORDED',1,'over-${suffix}',CURRENT_TIMESTAMP); RAISE EXCEPTION 'missing rejection'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='missing rejection' THEN RAISE; END IF; END; END $do$`);
    pass("over-return rejected", true);

    const cleaningLine = resolution.lines.find((line) => line.outcome === "NEEDS_CLEANING")!;
    const damagedLine = resolution.lines.find((line) => line.outcome === "DAMAGED")!;
    const cleaningAllocation = await tx.capacityAllocation.create({ data: { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id, quantity: 2, sourceType: "MAINTENANCE", blockedFrom: at(12), blockedUntil: null, status: "ACTIVE", maintenanceKind: "CLEANING", maintenanceLocationId: cleaning.id, bulkSourceResolutionLineId: cleaningLine.id } });
    const repairAllocation = await tx.capacityAllocation.create({ data: { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id, quantity: 1, sourceType: "MAINTENANCE", blockedFrom: at(12), blockedUntil: null, status: "ACTIVE", maintenanceKind: "REPAIR", maintenanceLocationId: repair.id, bulkSourceResolutionLineId: damagedLine.id } });
    pass("cleaning blocks two", await getActiveBulkMaintenanceQuantity(tx, { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id, locationId: cleaning.id }) === 2);
    pass("repair blocks cumulative quantity", await getActiveBulkMaintenanceQuantity(tx, { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id, locationId: repair.id }) === 2);
    const completeOne = await createBulkMaintenanceEvent(tx, { organizationId: organization.id, branchId: branch.id, capacityAllocationId: cleaningAllocation.id, productVariantId: variant.id, type: "COMPLETED", quantity: 1, idempotencyKey: `complete-${suffix}`, occurredAt: at(14), actorUserId: user.id });
    pass("partial cleaning completion", await getActiveBulkMaintenanceQuantity(tx, { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id, locationId: cleaning.id }) === 1);
    pass("maintenance event idempotent", (await createBulkMaintenanceEvent(tx, { organizationId: organization.id, branchId: branch.id, capacityAllocationId: cleaningAllocation.id, productVariantId: variant.id, type: "COMPLETED", quantity: 1, idempotencyKey: `complete-${suffix}`, occurredAt: at(15), actorUserId: user.id })).id === completeOne.id);
    const child = await tx.capacityAllocation.create({ data: { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id, quantity: 1, sourceType: "MAINTENANCE", sourceReferenceId: cleaningAllocation.id, blockedFrom: at(14), blockedUntil: null, status: "ACTIVE", maintenanceKind: "REPAIR", maintenanceLocationId: repair.id, parentMaintenanceAllocationId: cleaningAllocation.id } });
    await createBulkMaintenanceEvent(tx, { organizationId: organization.id, branchId: branch.id, capacityAllocationId: cleaningAllocation.id, relatedAllocationId: child.id, productVariantId: variant.id, type: "TRANSITIONED", quantity: 1, idempotencyKey: `transition-${suffix}`, occurredAt: at(14), actorUserId: user.id });
    await tx.capacityAllocation.update({ where: { id: cleaningAllocation.id }, data: { status: "RELEASED", releasedAt: at(14), releaseReason: "CLEANING_TRANSITIONED_TO_REPAIR" } });
    pass("cleaning to repair child provenance", child.parentMaintenanceAllocationId === cleaningAllocation.id);
    pass("cleaning fully released", (await tx.capacityAllocation.findUniqueOrThrow({ where: { id: cleaningAllocation.id } })).status === "RELEASED");
    pass("transition continuously blocks", calculatePeakBlockedCapacity(buildCapacitySegments([
      { id: cleaningAllocation.id, sourceType: "MAINTENANCE", quantity: 2, blockedFrom: at(12), blockedUntil: null, issuedQuantity: 0, returnedQuantity: 0 },
      { id: child.id, sourceType: "MAINTENANCE", quantity: 1, blockedFrom: at(14), blockedUntil: null, issuedQuantity: 0, returnedQuantity: 0 }
    ], "BULK", new Map(), new Map([[cleaningAllocation.id, 2]])), at(13), at(16)) === 1);
    pass("open ended repair blocks future", calculatePeakBlockedCapacity(buildCapacitySegments([{ id: repairAllocation.id, sourceType: "MAINTENANCE", quantity: 1, blockedFrom: at(12), blockedUntil: at(15), issuedQuantity: 0, returnedQuantity: 0 }], "BULK"), at(20), at(21)) === 1);
    pass("maintenance stock floor protects repair", await rejects(() => assertBulkMaintenanceStockFloor(tx, { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id, locationId: repair.id, resultingQuantity: 0 })));
    pass("serviceable stock floor unaffected", !await rejects(() => assertBulkMaintenanceStockFloor(tx, { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id, locationId: stock.id, resultingQuantity: 1 })));
    pass("completion does not require branch stock change", (await tx.stockLevel.aggregate({ where: { organizationId: organization.id, branchId: branch.id, productVariantId: variant.id }, _sum: { quantity: true } }))._sum.quantity === 16);

    await tx.organizationMembership.update({ where: { id: otherMembership.id }, data: { status: "SUSPENDED" } });
    pass("inactive membership denied before replay", await rejects(() => authorizeBulkOperation(tx, tenant, { userId: otherUser.id, membershipId: otherMembership.id, role: "SELLER" }, "RETURN_PROCESS", branch.id)));
    await tx.organizationMembership.update({ where: { id: otherMembership.id }, data: { status: "ACTIVE" } });
    await tx.membershipPermissionOverride.create({ data: { organizationId: organization.id, membershipId: otherMembership.id, permissionKey: "RETURN_PROCESS", effect: "DENY" } });
    pass("revoked permission denied before replay", await rejects(() => authorizeBulkOperation(tx, tenant, { userId: otherUser.id, membershipId: otherMembership.id, role: "SELLER" }, "RETURN_PROCESS", branch.id)));

    await tx.$executeRawUnsafe(`DO $do$ BEGIN BEGIN UPDATE bulk_physical_resolutions SET note='x' WHERE id='${resolution.id}'; RAISE EXCEPTION 'missing rejection'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='missing rejection' THEN RAISE; END IF; END; END $do$`);
    pass("return history immutable", true);
    await tx.$executeRawUnsafe(`DO $do$ BEGIN BEGIN UPDATE bulk_maintenance_events SET note='x' WHERE id='${completeOne.id}'; RAISE EXCEPTION 'missing rejection'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='missing rejection' THEN RAISE; END IF; END; END $do$`);
    pass("maintenance history immutable", true);
    const invalidChild = randomUUID();
    await tx.$executeRawUnsafe(`DO $do$ BEGIN BEGIN INSERT INTO capacity_allocations(id,organization_id,product_variant_id,branch_id,quantity,source_type,blocked_from,status,assigned_at,issued_quantity,returned_quantity,created_at,updated_at,maintenance_kind,maintenance_location_id,parent_maintenance_allocation_id) VALUES ('${invalidChild}','${organization.id}','${variant.id}','${branch.id}',1,'MAINTENANCE',CURRENT_TIMESTAMP,'ACTIVE',CURRENT_TIMESTAMP,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'REPAIR','${repair.id}','${repairAllocation.id}'); SET CONSTRAINTS capacity_allocations_bulk_maintenance_projection IMMEDIATE; RAISE EXCEPTION 'missing rejection'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='missing rejection' THEN RAISE; END IF; END; END $do$`);
    pass("direct SQL child without transition rejected", true);
    const invalidEvent = randomUUID();
    await tx.$executeRawUnsafe(`DO $do$ BEGIN BEGIN INSERT INTO bulk_maintenance_events(id,organization_id,branch_id,capacity_allocation_id,product_variant_id,type,quantity,idempotency_key,occurred_at) VALUES ('${invalidEvent}','${organization.id}','${branch.id}','${repairAllocation.id}','${variant.id}','COMPLETED',2,'invalid-${suffix}',CURRENT_TIMESTAMP); RAISE EXCEPTION 'missing rejection'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='missing rejection' THEN RAISE; END IF; END; END $do$`);
    pass("invalid maintenance quantity rejected", true);
    await tx.$executeRawUnsafe(`DO $do$ BEGIN BEGIN INSERT INTO bulk_maintenance_events(organization_id,branch_id,capacity_allocation_id,related_allocation_id,product_variant_id,type,quantity,idempotency_key,occurred_at) VALUES ('${organization.id}','${branch.id}','${repairAllocation.id}','${child.id}','${variant.id}','COMPLETED',1,'invalid-related-${suffix}',CURRENT_TIMESTAMP); RAISE EXCEPTION 'missing rejection'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='missing rejection' THEN RAISE; END IF; END; END $do$`);
    pass("non-transition related allocation rejected", true);
    await tx.$executeRawUnsafe(`DO $do$ BEGIN BEGIN INSERT INTO bulk_physical_resolutions(organization_id,branch_id,order_id,order_item_id,capacity_allocation_id,product_variant_id,kind,provenance,total_quantity,idempotency_key,occurred_at) VALUES ('${organization.id}','${otherBranch.id}','${order.id}','${item.id}','${allocation.id}','${variant.id}','RETURN','RECORDED',1,'wrong-branch-${suffix}',CURRENT_TIMESTAMP); RAISE EXCEPTION 'missing rejection'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='missing rejection' THEN RAISE; END IF; END; END $do$`);
    pass("direct SQL branch mismatch rejected", true);
    pass("legacy unknown remains allowed", validateBulkResolutionLines("RETURN", [{ outcome: "LEGACY_UNKNOWN", quantity: 1 }]) === 1);
    pass("SERIALIZED semantics untouched by schema", await tx.product.count({ where: { organizationId: organization.id, trackingMode: "SERIALIZED" } }) === 0);
    pass("loss is not a return movement", await tx.inventoryMovement.count({ where: { organizationId: organization.id, type: "RENTAL_RETURN", bulkResolutionLine: { resolution: { kind: "LOSS_RESOLUTION" } } } }) === 0);
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    pass("all deferred invariants satisfied", true);
    throw rollback;
  }, { maxWait: 30_000, timeout: 180_000 }).catch((error) => { if (error !== rollback) throw error; });

  pass("transactional fixture cleanup", await db.organization.count({ where: { slug: { startsWith: "bulk-2-" } } }) === 0);
  console.log(`BULK-2 targeted: ${passed.length}/${passed.length} passed`);
  console.log(passed);
}

main().finally(() => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
