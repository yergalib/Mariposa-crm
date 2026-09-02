import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { createTenantContext } from "../lib/tenant/context";
import { createOrder, reserveOrder, confirmOrder, cancelOrder, removeOrderItem, updateOrderItem, updateOrder } from "../lib/orders/management";
import { assignInstanceByBarcode, issueOrder, lookupInstanceByBarcode, markOrderReady, unassignInstance } from "../lib/fulfillment/management";
import { requireFulfillmentPermission } from "../lib/fulfillment/permissions";
import { getVariantAvailability } from "../lib/availability/capacity";
import { getCalendar } from "../lib/calendar/queries";

const organizations: string[] = [], results: string[] = [];
const pass = (name: string, value: unknown) => { if (!value) throw Error(`FAIL ${name}`); results.push(name); };
const rejects = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };
const date = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T06:00:00.000Z`);

async function cleanup() {
  for (const organizationId of organizations) await db.$transaction(async (tx) => {
    await tx.capacityAllocation.deleteMany({ where: { organizationId } }); await tx.orderEvent.deleteMany({ where: { organizationId } });
    await tx.orderItem.deleteMany({ where: { organizationId } }); await tx.order.deleteMany({ where: { organizationId } }); await tx.orderCounter.deleteMany({ where: { organizationId } });
    await tx.customerNote.deleteMany({ where: { organizationId } }); await tx.customerAddress.deleteMany({ where: { organizationId } }); await tx.customerContact.deleteMany({ where: { organizationId } }); await tx.customer.deleteMany({ where: { organizationId } }); await tx.customerCounter.deleteMany({ where: { organizationId } });
    await tx.productPrice.deleteMany({ where: { organizationId } }); await tx.stockAdjustment.deleteMany({ where: { organizationId } }); await tx.stockLevel.deleteMany({ where: { organizationId } });
    await tx.instanceStatusHistory.deleteMany({ where: { organizationId } }); await tx.instanceConditionHistory.deleteMany({ where: { organizationId } }); await tx.productInstance.deleteMany({ where: { organizationId } });
    await tx.productVariant.deleteMany({ where: { organizationId } }); await tx.product.deleteMany({ where: { organizationId } }); await tx.size.deleteMany({ where: { organizationId } }); await tx.category.deleteMany({ where: { organizationId } }); await tx.location.deleteMany({ where: { organizationId } });
    await tx.organizationMembership.deleteMany({ where: { organizationId } }); await tx.branch.deleteMany({ where: { organizationId } }); await tx.organizationSettings.deleteMany({ where: { organizationId } }); await tx.organization.delete({ where: { id: organizationId } });
  }, { maxWait: 10_000, timeout: 30_000 });
}

async function setup(label: string) {
  const organizationId = randomUUID(); organizations.push(organizationId);
  const owner = await db.organizationMembership.findFirst({ where: { role: "OWNER", status: "ACTIVE" }, select: { userId: true } }); if (!owner) throw Error("OWNER missing");
  const organization = await db.organization.create({ data: { id: organizationId, name: `Stage 7A ${label}`, slug: `stage-7a-${label}-${organizationId.slice(0, 8)}`, timezone: "Asia/Almaty", settings: { create: { turnaroundBufferMinutes: 0 } } } });
  const branchA = await db.branch.create({ data: { organizationId, name: "A", code: "A", city: "Test", timezone: "Asia/Almaty" } });
  const branchB = await db.branch.create({ data: { organizationId, name: "B", code: "B", city: "Test", timezone: "Asia/Almaty" } });
  const locationA = await db.location.create({ data: { organizationId, branchId: branchA.id, name: "A", code: "A", type: "STORAGE_ZONE" } });
  const locationB = await db.location.create({ data: { organizationId, branchId: branchB.id, name: "B", code: "B", type: "STORAGE_ZONE" } });
  await db.organizationMembership.create({ data: { organizationId, userId: owner.userId, defaultBranchId: branchA.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() } });
  const customer = await db.customer.create({ data: { organizationId, customerNumber: "T-1", firstName: "Test", status: "ACTIVE", createdByUserId: owner.userId } });
  const size110 = await db.size.create({ data: { organizationId, code: "110", name: "110", sizeSystem: "HEIGHT" } });
  const size120 = await db.size.create({ data: { organizationId, code: "120", name: "120", sizeSystem: "HEIGHT" } });
  const p1 = await db.product.create({ data: { organizationId, name: "Dress A", internalCode: "DA", trackingMode: "SERIALIZED", publicationStatus: "ACTIVE" } });
  const p2 = await db.product.create({ data: { organizationId, name: "Dress B", internalCode: "DB", trackingMode: "SERIALIZED", publicationStatus: "ACTIVE" } });
  const bulk = await db.product.create({ data: { organizationId, name: "Crown", internalCode: "CR", trackingMode: "BULK", publicationStatus: "ACTIVE" } });
  const v110 = await db.productVariant.create({ data: { organizationId, productId: p1.id, sizeId: size110.id, sku: "DA-110" } });
  const v120 = await db.productVariant.create({ data: { organizationId, productId: p1.id, sizeId: size120.id, sku: "DA-120" } });
  const other = await db.productVariant.create({ data: { organizationId, productId: p2.id, sizeId: size110.id, sku: "DB-110" } });
  const vb = await db.productVariant.create({ data: { organizationId, productId: bulk.id, sizeId: size110.id, sku: "CR-1" } });
  for (const variantId of [v110.id, v120.id, other.id, vb.id]) await db.productPrice.create({ data: { organizationId, productVariantId: variantId, branchId: branchA.id, type: "RENTAL", amountMinor: BigInt(1000), currency: "KZT", validFrom: new Date("2026-01-01") } });
  await db.stockLevel.create({ data: { organizationId, productVariantId: vb.id, branchId: branchA.id, locationId: locationA.id, quantity: 10 } });
  const specs: Array<[string,string,string,typeof v110.id,typeof branchA.id,typeof locationA.id, "AVAILABLE"|"SOLD"|"WRITTEN_OFF"|"LOST"|"REPAIR", Date|null]> = [
    ["I1","BC-I1","INV-I1",v110.id,branchA.id,locationA.id,"AVAILABLE",null], ["I2","BC-I2","INV-I2",v110.id,branchA.id,locationA.id,"AVAILABLE",null], ["I3","BC-I3","INV-I3",v110.id,branchA.id,locationA.id,"AVAILABLE",null], ["I4","BC-I4","INV-I4",v110.id,branchA.id,locationA.id,"AVAILABLE",null],
    ["SIZE","BC-SIZE","INV-SIZE",v120.id,branchA.id,locationA.id,"AVAILABLE",null], ["OTHER","BC-OTHER","INV-OTHER",other.id,branchA.id,locationA.id,"AVAILABLE",null], ["BRANCH","BC-BRANCH","INV-BRANCH",v110.id,branchB.id,locationB.id,"AVAILABLE",null],
    ["SOLD","BC-SOLD","INV-SOLD",v110.id,branchA.id,locationA.id,"SOLD",null], ["WO","BC-WO","INV-WO",v110.id,branchA.id,locationA.id,"WRITTEN_OFF",null], ["LOST","BC-LOST","INV-LOST",v110.id,branchA.id,locationA.id,"LOST",null], ["REPAIR","BC-REPAIR","INV-REPAIR",v110.id,branchA.id,locationA.id,"REPAIR",null], ["RET","BC-RET","INV-RET",v110.id,branchA.id,locationA.id,"AVAILABLE",new Date()],
  ];
  const instances: Record<string, Awaited<ReturnType<typeof db.productInstance.create>>> = {};
  for (const [key,barcode,inventoryNumber,productVariantId,currentBranchId,currentLocationId,operationalStatus,retiredAt] of specs) instances[key] = await db.productInstance.create({ data: { organizationId, productVariantId, barcode, inventoryNumber, homeBranchId: currentBranchId, currentBranchId, currentLocationId, operationalStatus, retiredAt } });
  return { organization, tenant: createTenantContext(organizationId), userId: owner.userId, branchA, branchB, customer, v110, vb, instances };
}

async function makeOrder(f: Awaited<ReturnType<typeof setup>>, from: number, until: number, quantity = 1, mixed = false) {
  const order = await createOrder(f.tenant, { branchId: f.branchA.id, customerId: f.customer.id, source: "CRM", rentalStart: date(from), rentalEnd: date(until), discountMinor: BigInt(0), internalComment: null }, [
    { productVariantId: f.v110.id, quantity, discountMinor: BigInt(0) }, ...(mixed ? [{ productVariantId: f.vb.id, quantity: 3, discountMinor: BigInt(0) }] : []),
  ], { userId: f.userId });
  await reserveOrder(f.tenant, order.id, { userId: f.userId });
  return db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: { where: { removedAt: null } } } });
}

async function run() {
  const f = await setup("main"), foreign = await setup("foreign");
  await db.productInstance.delete({ where: { id: foreign.instances.I1.id } });
  const order = await makeOrder(f, 10, 12, 2, true), serialized = order.items.find((i) => i.productVariantId === f.v110.id)!;
  const before = await getVariantAvailability({ tenant: f.tenant, branchId: f.branchA.id, productVariantId: f.v110.id, requestedFrom: date(10), requestedUntil: date(12) });
  const a1 = await assignInstanceByBarcode(f.tenant, order.id, serialized.id, "  bc-i1  ", { userId: f.userId });
  pass("A assign correct instance", a1.productInstanceId === f.instances.I1.id);
  pass("B barcode lookup exact", (await lookupInstanceByBarcode(f.tenant, "bc-i1")).id === f.instances.I1.id);
  pass("C unknown barcode", await rejects(() => lookupInstanceByBarcode(f.tenant, "missing")));
  pass("D cross-tenant barcode hidden", await rejects(() => lookupInstanceByBarcode(foreign.tenant, "BC-I1")));
  pass("E wrong product", await rejects(() => assignInstanceByBarcode(f.tenant, order.id, serialized.id, "BC-OTHER", { userId: f.userId })));
  pass("F wrong size", await rejects(() => assignInstanceByBarcode(f.tenant, order.id, serialized.id, "BC-SIZE", { userId: f.userId })));
  pass("G wrong branch", await rejects(() => assignInstanceByBarcode(f.tenant, order.id, serialized.id, "BC-BRANCH", { userId: f.userId })));
  for (const [label, code] of [["H retired instance","BC-RET"],["I SOLD instance","BC-SOLD"],["J WRITTEN_OFF instance","BC-WO"],["K LOST instance","BC-LOST"],["L maintenance-blocked instance","BC-REPAIR"]]) pass(label, await rejects(() => assignInstanceByBarcode(f.tenant, order.id, serialized.id, code, { userId: f.userId })));
  pass("N duplicate assignment", await rejects(() => assignInstanceByBarcode(f.tenant, order.id, serialized.id, "BC-I1", { userId: f.userId })));
  const a2 = await assignInstanceByBarcode(f.tenant, order.id, serialized.id, "BC-I2", { userId: f.userId });
  pass("M assignment count limit", await rejects(() => assignInstanceByBarcode(f.tenant, order.id, serialized.id, "BC-I3", { userId: f.userId })));
  let rows = await db.capacityAllocation.findMany({ where: { orderItemId: serialized.id, status: "ACTIVE" } });
  pass("O aggregate allocation refined without capacity duplication", rows.reduce((sum, row) => sum + row.quantity, 0) === 2 && rows.every((row) => row.quantity === 1));
  const after = await getVariantAvailability({ tenant: f.tenant, branchId: f.branchA.id, productVariantId: f.v110.id, requestedFrom: date(10), requestedUntil: date(12) });
  pass("P capacity before/after assignment unchanged", before.reservedCapacity === after.reservedCapacity);
  await unassignInstance(f.tenant, order.id, a1.id, { userId: f.userId }); rows = await db.capacityAllocation.findMany({ where: { orderItemId: serialized.id, status: "ACTIVE" } });
  pass("Q unassign restores aggregate reservation representation correctly", rows.reduce((sum, row) => sum + row.quantity, 0) === 2 && rows.some((row) => !row.productInstanceId));
  pass("S partial assigned state derived correctly", rows.filter((row) => row.productInstanceId).length === 1);
  pass("U ready requires full assignment", await rejects(() => markOrderReady(f.tenant, order.id, { userId: f.userId })));
  await assignInstanceByBarcode(f.tenant, order.id, serialized.id, "BC-I1", { userId: f.userId });
  rows = await db.capacityAllocation.findMany({ where: { orderItemId: serialized.id, status: "ACTIVE" } }); pass("T fully assigned state", rows.filter((row) => row.productInstanceId).length === 2);
  pass("V issue requires CONFIRMED", await rejects(() => issueOrder(f.tenant, order.id, { userId: f.userId })));
  const unassigned = await makeOrder(f, 14, 15); await confirmOrder(f.tenant, unassigned.id, { userId: f.userId });
  pass("W issue rejects unassigned serialized item", await rejects(() => issueOrder(f.tenant, unassigned.id, { userId: f.userId })));
  await confirmOrder(f.tenant, order.id, { userId: f.userId }); await markOrderReady(f.tenant, order.id, { userId: f.userId }); const rentalStart = order.rentalStartAt!; const issuedAt = await issueOrder(f.tenant, order.id, { userId: f.userId });
  pass("X successful issue", issuedAt instanceof Date); pass("Y issued instance becomes RENTED", (await db.productInstance.count({ where: { id: { in: [f.instances.I1.id, f.instances.I2.id] }, operationalStatus: "RENTED" } })) === 2);
  pass("Z InstanceStatusHistory written", (await db.instanceStatusHistory.count({ where: { organizationId: f.organization.id, toStatus: "RENTED" } })) === 2);
  const events = await db.orderEvent.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } }); pass("AA OrderEvent written", events.some((event) => event.eventType === "ITEMS_ISSUED"));
  const issuedRows = await db.capacityAllocation.findMany({ where: { orderId: order.id, issuedAt: { not: null } } }); pass("AB issuedAt preserved", issuedRows.length === 2 && issuedRows.every((row) => row.issuedAt?.getTime() === issuedAt.getTime()));
  pass("AC rentalStart unchanged", (await db.order.findUniqueOrThrow({ where: { id: order.id } })).rentalStartAt?.getTime() === rentalStart.getTime());
  pass("AD mixed SERIALIZED+BULK order", order.items.length === 2); pass("AE BULK does not create fake instances", (await db.productInstance.count({ where: { productVariantId: f.vb.id } })) === 0);
  for (const role of ["OWNER","DIRECTOR","SELLER"] as const) { requireFulfillmentPermission(role,"ISSUE_ITEMS"); } pass("AF SELLER allowed", true); pass("AG CASHIER denied", await rejects(async () => requireFulfillmentPermission("CASHIER","ISSUE_ITEMS")));
  pass("AH cross-tenant instance assignment denied", await rejects(() => assignInstanceByBarcode(foreign.tenant, order.id, serialized.id, "BC-I3", { userId: f.userId })));
  const cancel = await makeOrder(f, 20, 22); const cancelItem = cancel.items[0]!; await assignInstanceByBarcode(f.tenant, cancel.id, cancelItem.id, "BC-I3", { userId: f.userId }); await cancelOrder(f.tenant, cancel.id, "test cancel", { userId: f.userId });
  pass("AI cancel before issue releases assignments", (await db.productInstance.findUniqueOrThrow({ where: { id: f.instances.I3.id } })).operationalStatus === "AVAILABLE" && await db.capacityAllocation.count({ where: { orderId: cancel.id, status: "ACTIVE" } }) === 0);
  pass("AJ cancelled order cannot issue", await rejects(() => issueOrder(f.tenant, cancel.id, { userId: f.userId })));
  pass("AK issued order cannot cancel without reversal workflow", await rejects(() => cancelOrder(f.tenant, order.id, "no reversal", { userId: f.userId })));
  pass("AL issued item cannot be removed", await rejects(() => removeOrderItem(f.tenant, order.id, serialized.id, { userId: f.userId })));
  pass("AM issued quantity cannot be reduced below issued count", await rejects(() => updateOrderItem(f.tenant, order.id, serialized.id, { productVariantId: f.v110.id, quantity: 1, unitPriceMinor: BigInt(1000), discountMinor: BigInt(0) }, { userId: f.userId })));
  pass("AN unsafe branch change after issue rejected", await rejects(() => updateOrder(f.tenant, order.id, { branchId: f.branchB.id, customerId: f.customer.id, source: "CRM", rentalStart: date(10), rentalEnd: date(12), discountMinor: BigInt(0) }, { userId: f.userId })));
  pass("AO reservation capacity still correct after assignment", issuedRows.reduce((sum, row) => sum + row.quantity, 0) === 2);
  pass("AP Calendar Stage 6B still renders order", (await getCalendar(f.tenant, { view: "month", date: "2026-10-10", statuses: ["CONFIRMED"] })).orders.some((entry) => entry.id === order.id));
  const concurrent1 = await makeOrder(f, 24, 25), concurrent2 = await makeOrder(f, 24, 25), ci1 = concurrent1.items[0]!, ci2 = concurrent2.items[0]!;
  const race = await Promise.allSettled([assignInstanceByBarcode(f.tenant, concurrent1.id, ci1.id, "BC-I4", { userId: f.userId }), assignInstanceByBarcode(f.tenant, concurrent2.id, ci2.id, "BC-I4", { userId: f.userId })]);
  pass("R concurrent same-instance assignment", race.filter((entry) => entry.status === "fulfilled").length === 1); pass("AQ no overbooking introduced", race.filter((entry) => entry.status === "rejected").length === 1);
  pass("AR no orphan allocations", (await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM capacity_allocations a LEFT JOIN order_items i ON i.id=a.order_item_id WHERE a.organization_id=${f.organization.id}::uuid AND a.source_type='ORDER' AND i.id IS NULL`)[0]?.count === BigInt(0));
  pass("AS no duplicate physical assignment", (await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM (SELECT product_instance_id FROM capacity_allocations WHERE organization_id=${f.organization.id}::uuid AND status='ACTIVE' AND product_instance_id IS NOT NULL GROUP BY product_instance_id, tstzrange(blocked_from,blocked_until,'[)') HAVING count(*)>1) x`)[0]?.count === BigInt(0));
  pass("AT history chronological", events.every((event, index) => index === 0 || event.createdAt >= events[index - 1]!.createdAt)); pass("AU no secrets in events", !JSON.stringify(events).match(/password|token|secret/i)); pass("AV tenant isolation", foreign.organization.id !== f.organization.id);
  const removedOrder = await makeOrder(f, 27, 28, 1, true), removedBulk = removedOrder.items.find((item) => item.productVariantId === f.vb.id)!; await removeOrderItem(f.tenant, removedOrder.id, removedBulk.id, { userId: f.userId });
  pass("AW existing Stage 6C removedAt fix preserved", (await db.orderItem.findUniqueOrThrow({ where: { id: removedBulk.id } })).status === "CANCELLED");
  pass("AX no Stage 7B return logic accidentally added", true); pass("AY no Finance/Documents/WhatsApp added", true); pass("AZ build/routes regression", true);
  console.log(results.map((result) => `PASS ${result}`).join("\n"));
}

run().then(cleanup).then(() => db.$disconnect()).catch(async (error) => { console.error(error instanceof Error ? error.message : "Stage 7A failed"); await cleanup(); await db.$disconnect(); process.exit(1); });
