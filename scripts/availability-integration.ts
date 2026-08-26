import "dotenv/config";

import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  assignInstanceToAllocation,
  findAvailableInstances,
  getVariantAvailability,
  releaseCapacityAllocation,
  reserveCapacity
} from "../lib/availability/capacity";
import {
  AllocationNotFoundError,
  InsufficientCapacityError,
  ResourceNotFoundError
} from "../lib/availability/errors";
import { createTenantContext } from "../lib/tenant/context";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const testOrganizationId = randomUUID();

async function cleanup() {
  await db.capacityAllocation.deleteMany({ where: { organizationId: testOrganizationId } });
  await db.stockLevel.deleteMany({ where: { organizationId: testOrganizationId } });
  await db.productInstance.deleteMany({ where: { organizationId: testOrganizationId } });
  await db.productVariant.deleteMany({ where: { organizationId: testOrganizationId } });
  await db.size.deleteMany({ where: { organizationId: testOrganizationId } });
  await db.product.deleteMany({ where: { organizationId: testOrganizationId } });
  await db.location.deleteMany({ where: { organizationId: testOrganizationId } });
  await db.branch.deleteMany({ where: { organizationId: testOrganizationId } });
  await db.organizationSettings.deleteMany({ where: { organizationId: testOrganizationId } });
  await db.organization.deleteMany({ where: { id: testOrganizationId } });
}

async function main() {
  const suffix = testOrganizationId.slice(0, 8);
  const organization = await db.organization.create({
    data: { id: testOrganizationId, name: "Availability integration test", slug: `availability-test-${suffix}` }
  });
  await db.organizationSettings.create({
    data: { organizationId: organization.id, turnaroundBufferMinutes: 0 }
  });
  const branch = await db.branch.create({
    data: { organizationId: organization.id, name: "Test branch", code: "TEST", city: "Test", timezone: "UTC" }
  });
  const location = await db.location.create({
    data: { organizationId: organization.id, branchId: branch.id, name: "Test stock", code: "TEST-STOCK", type: "WAREHOUSE" }
  });
  const size = await db.size.create({
    data: { organizationId: organization.id, code: "ONE", name: "One" }
  });
  const serializedProduct = await db.product.create({
    data: { organizationId: organization.id, name: "Serialized test", internalCode: `SER-${suffix}`, trackingMode: "SERIALIZED", publicationStatus: "ACTIVE" }
  });
  const serializedVariant = await db.productVariant.create({
    data: { organizationId: organization.id, productId: serializedProduct.id, sizeId: size.id, sku: `SER-${suffix}-ONE` }
  });
  const instances = await Promise.all(Array.from({ length: 3 }, (_, index) => db.productInstance.create({
    data: {
      organizationId: organization.id,
      productVariantId: serializedVariant.id,
      inventoryNumber: `TEST-${suffix}-${index + 1}`,
      barcode: `TEST-${suffix}-${index + 1}`,
      homeBranchId: branch.id,
      currentBranchId: branch.id,
      currentLocationId: location.id
    }
  })));
  const singleProduct = await db.product.create({
    data: { organizationId: organization.id, name: "Concurrency test", internalCode: `ONE-${suffix}`, trackingMode: "SERIALIZED", publicationStatus: "ACTIVE" }
  });
  const singleVariant = await db.productVariant.create({
    data: { organizationId: organization.id, productId: singleProduct.id, sizeId: size.id, sku: `ONE-${suffix}-ONE` }
  });
  const singleInstance = await db.productInstance.create({
    data: { organizationId: organization.id, productVariantId: singleVariant.id, inventoryNumber: `ONE-${suffix}-1`, barcode: `ONE-${suffix}-1`, homeBranchId: branch.id, currentBranchId: branch.id, currentLocationId: location.id }
  });
  const bulkProduct = await db.product.create({
    data: { organizationId: organization.id, name: "Bulk test", internalCode: `BULK-${suffix}`, trackingMode: "BULK", publicationStatus: "ACTIVE" }
  });
  const bulkVariant = await db.productVariant.create({
    data: { organizationId: organization.id, productId: bulkProduct.id, sizeId: size.id, sku: `BULK-${suffix}-ONE` }
  });
  await db.stockLevel.createMany({
    data: [
      { organizationId: organization.id, productVariantId: bulkVariant.id, branchId: branch.id, quantity: 4 },
      { organizationId: organization.id, productVariantId: bulkVariant.id, branchId: branch.id, locationId: location.id, quantity: 6 }
    ]
  });

  const tenant = createTenantContext(organization.id);
  const from = new Date("2040-01-10T10:00:00.000Z");
  const until = new Date("2040-01-10T12:00:00.000Z");
  const nextFrom = new Date("2040-01-10T12:00:00.000Z");
  const nextUntil = new Date("2040-01-10T14:00:00.000Z");

  const initial = await getVariantAvailability({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, requestedFrom: from, requestedUntil: until, requestedQuantity: 3 });
  assert(initial.totalCapacity === 3 && initial.availableCapacity === 3 && initial.canFulfill, "A SERIALIZED availability failed");
  await db.productInstance.update({ where: { id: instances[0].id }, data: { operationalStatus: "REPAIR" } });
  const integrityGap = await getVariantAvailability({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, requestedFrom: from, requestedUntil: until });
  assert(integrityGap.untrackedUnavailableCapacity === 1 && integrityGap.availableCapacity === 2, "A untracked temporary status safeguard failed");
  await db.productInstance.update({ where: { id: instances[0].id }, data: { operationalStatus: "AVAILABLE" } });

  const multi = await reserveCapacity({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, sourceType: "MANUAL_BLOCK", quantity: 2, requestedFrom: from, requestedUntil: until });
  const askTwo = await getVariantAvailability({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, requestedFrom: from, requestedUntil: until, requestedQuantity: 2 });
  const askOne = await getVariantAvailability({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, requestedFrom: from, requestedUntil: until, requestedQuantity: 1 });
  assert(askTwo.reservedCapacity === 2 && !askTwo.canFulfill && askOne.canFulfill, "C multi-quantity failed");
  const adjacent = await getVariantAvailability({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, requestedFrom: nextFrom, requestedUntil: nextUntil });
  assert(adjacent.reservedCapacity === 0, "E half-open boundary failed");
  await releaseCapacityAllocation({ tenant, allocationId: multi.id, outcome: "RELEASED", reason: "Integration test" });

  await db.product.update({ where: { id: serializedProduct.id }, data: { turnaroundBufferMinutes: 30 } });
  const buffered = await reserveCapacity({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, sourceType: "MANUAL_BLOCK", quantity: 1, requestedFrom: from, requestedUntil: until });
  const bufferedNext = await getVariantAvailability({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, requestedFrom: nextFrom, requestedUntil: nextUntil });
  assert(bufferedNext.turnaroundBufferMinutes === 30 && bufferedNext.reservedCapacity === 1, "F turnaround buffer failed");
  await releaseCapacityAllocation({ tenant, allocationId: buffered.id, outcome: "RELEASED", reason: "Integration test" });
  await db.product.update({ where: { id: serializedProduct.id }, data: { turnaroundBufferMinutes: 0 } });

  const candidates = await findAvailableInstances({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, requestedFrom: from, requestedUntil: until });
  assert(candidates.length === 3, "Available instance candidates failed");
  const preassigned = await reserveCapacity({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, sourceType: "MANUAL_BLOCK", quantity: 1, requestedFrom: from, requestedUntil: until });
  const assigned = await assignInstanceToAllocation({ tenant, allocationId: preassigned.id, productInstanceId: instances[0].id });
  assert(assigned.productInstanceId === instances[0].id, "H pre-assignment failed");
  const replaced = await assignInstanceToAllocation({ tenant, allocationId: preassigned.id, productInstanceId: instances[1].id });
  assert(replaced.productInstanceId === instances[1].id, "I replacement assignment failed");
  await releaseCapacityAllocation({ tenant, allocationId: preassigned.id, outcome: "CANCELLED", reason: "Integration test" });
  const afterRelease = await getVariantAvailability({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, requestedFrom: from, requestedUntil: until, requestedQuantity: 3 });
  assert(afterRelease.canFulfill, "J release failed");

  const maintenance = await reserveCapacity({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, productInstanceId: instances[2].id, sourceType: "MAINTENANCE", quantity: 1, requestedFrom: from, requestedUntil: null });
  const future = await getVariantAvailability({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, requestedFrom: nextFrom, requestedUntil: nextUntil });
  assert(future.reservedCapacity === 1, "G open-ended maintenance failed");
  await releaseCapacityAllocation({ tenant, allocationId: maintenance.id, outcome: "RELEASED", reason: "Repair completed" });
  const maintenanceReleased = await getVariantAvailability({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, requestedFrom: nextFrom, requestedUntil: nextUntil, requestedQuantity: 3 });
  assert(maintenanceReleased.canFulfill, "G maintenance release failed");

  const transfer = await reserveCapacity({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, productInstanceId: instances[2].id, sourceType: "TRANSFER", quantity: 1, requestedFrom: from, requestedUntil: until });
  const transferBlocked = await getVariantAvailability({ tenant, branchId: branch.id, productVariantId: serializedVariant.id, requestedFrom: from, requestedUntil: until });
  assert(transferBlocked.reservedCapacity === 1, "TRANSFER block failed");
  await releaseCapacityAllocation({ tenant, allocationId: transfer.id, outcome: "RELEASED", reason: "Transfer completed" });

  const bulkReserved = await reserveCapacity({ tenant, branchId: branch.id, productVariantId: bulkVariant.id, sourceType: "MANUAL_BLOCK", quantity: 4, requestedFrom: from, requestedUntil: until });
  const bulkSix = await getVariantAvailability({ tenant, branchId: branch.id, productVariantId: bulkVariant.id, requestedFrom: from, requestedUntil: until, requestedQuantity: 6 });
  const bulkSeven = await getVariantAvailability({ tenant, branchId: branch.id, productVariantId: bulkVariant.id, requestedFrom: from, requestedUntil: until, requestedQuantity: 7 });
  assert(bulkSix.totalCapacity === 10 && bulkSix.reservedCapacity === 4 && bulkSix.availableCapacity === 6 && bulkSix.canFulfill && !bulkSeven.canFulfill, "B/C BULK availability failed");
  await releaseCapacityAllocation({ tenant, allocationId: bulkReserved.id, outcome: "RELEASED", reason: "Integration test" });

  const wrongTenant = createTenantContext(randomUUID());
  await getVariantAvailability({ tenant: wrongTenant, branchId: branch.id, productVariantId: serializedVariant.id, requestedFrom: from, requestedUntil: until }).then(() => { throw new Error("K tenant availability leak"); }, (error) => assert(error instanceof ResourceNotFoundError, "K availability tenant error failed"));
  await assignInstanceToAllocation({ tenant: wrongTenant, allocationId: preassigned.id, productInstanceId: instances[0].id }).then(() => { throw new Error("K tenant assignment leak"); }, (error) => assert(error instanceof AllocationNotFoundError, "K assignment tenant error failed"));
  await releaseCapacityAllocation({ tenant: wrongTenant, allocationId: preassigned.id, outcome: "RELEASED", reason: "No" }).then(() => { throw new Error("K tenant release leak"); }, (error) => assert(error instanceof AllocationNotFoundError, "K release tenant error failed"));

  const concurrent = await Promise.allSettled([1, 2].map(() => reserveCapacity({ tenant, branchId: branch.id, productVariantId: singleVariant.id, sourceType: "MANUAL_BLOCK", quantity: 1, requestedFrom: from, requestedUntil: until })));
  assert(concurrent.filter((item) => item.status === "fulfilled").length === 1, "L concurrent success count failed");
  const rejected = concurrent.find((item): item is PromiseRejectedResult => item.status === "rejected");
  assert(
    rejected?.reason instanceof InsufficientCapacityError,
    `L concurrent business error failed (${rejected?.reason instanceof Error ? `${rejected.reason.name}: ${rejected.reason.message}` : "unknown"})`
  );

  let exclusionRejected = false;
  try {
    await db.$transaction(async (tx) => {
      const data = { organizationId: organization.id, branchId: branch.id, productVariantId: singleVariant.id, productInstanceId: singleInstance.id, sourceType: "MANUAL_BLOCK" as const, quantity: 1, blockedFrom: new Date("2041-01-01T00:00:00Z"), blockedUntil: new Date("2041-01-02T00:00:00Z") };
      await tx.capacityAllocation.create({ data });
      await tx.capacityAllocation.create({ data: { ...data, blockedFrom: new Date("2041-01-01T12:00:00Z") } });
    });
  } catch {
    exclusionRejected = true;
  }
  assert(exclusionRejected, "M DB exclusion constraint failed");

  console.info(JSON.stringify({ A_SERIALIZED: true, B_BULK: true, C_MULTI_QUANTITY: true, D_OVERLAP: true, E_HALF_OPEN: true, F_BUFFER: true, G_OPEN_ENDED: true, H_PRE_ASSIGNMENT: true, I_REPLACEMENT: true, J_RELEASE: true, K_TENANT: true, L_CONCURRENCY: true, M_EXCLUSION: true }));
}

main()
  .finally(cleanup)
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : "Availability integration test failed");
    process.exitCode = 1;
  });
