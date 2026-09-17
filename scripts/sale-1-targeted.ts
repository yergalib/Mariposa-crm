import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { db } from "../lib/db";
import { createTenantContext } from "../lib/tenant/context";
import { buildCapacitySegments, calculatePeakBlockedCapacity, getPermanentFleetReductionAvailabilityWithClient, getVariantAvailabilityWithClient } from "../lib/availability/capacity";
import { revenueFamily } from "../lib/dashboard/queries";
import { synchronizeOrderChargeWithClient } from "../lib/finance/order-payments";
import { effectsFor } from "../lib/finance/effects";
import { defaultHasPermission } from "../lib/permissions/registry";

const passed: string[] = [];
function pass(name: string, condition: unknown) { if (!condition) throw new Error(`FAIL ${name}`); passed.push(name); }
const at = (day: number, hour = 0) => new Date(Date.UTC(2045, 0, day, hour));
const rollback = new Error("SALE_1_ROLLBACK");

async function fixture(tx: Prisma.TransactionClient, label: string) {
  const suffix = `${label}-${randomUUID().slice(0, 8)}`;
  const organization = await tx.organization.create({ data: { name: "SALE-1", slug: `sale-1-${suffix}` } });
  const user = await tx.user.create({ data: { email: `${suffix}@example.test`, displayName: "SALE-1", passwordHash: "test" } });
  const branch = await tx.branch.create({ data: { organizationId: organization.id, name: "A", code: "A", city: "Test", timezone: "UTC" } });
  const location = await tx.location.create({ data: { organizationId: organization.id, branchId: branch.id, name: "Stock", code: "STOCK", type: "WAREHOUSE" } });
  const membership = await tx.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER", status: "ACTIVE", defaultBranchId: branch.id } });
  const customer = await tx.customer.create({ data: { organizationId: organization.id, customerNumber: `C-${suffix}`, firstName: "Test" } });
  const size = await tx.size.create({ data: { organizationId: organization.id, code: `S-${suffix}`, name: "M" } });
  const bulkProduct = await tx.product.create({ data: { organizationId: organization.id, name: "Bulk", internalCode: `B-${suffix}`, trackingMode: "BULK" } });
  const serialProduct = await tx.product.create({ data: { organizationId: organization.id, name: "Serial", internalCode: `S-${suffix}`, trackingMode: "SERIALIZED" } });
  const bulkVariant = await tx.productVariant.create({ data: { organizationId: organization.id, productId: bulkProduct.id, sizeId: size.id, sku: `B-${suffix}` } });
  const serialVariant = await tx.productVariant.create({ data: { organizationId: organization.id, productId: serialProduct.id, sizeId: size.id, sku: `S-${suffix}` } });
  await tx.stockLevel.create({ data: { organizationId: organization.id, productVariantId: bulkVariant.id, branchId: branch.id, locationId: location.id, quantity: 5 } });
  const instance = await tx.productInstance.create({ data: { organizationId: organization.id, productVariantId: serialVariant.id, inventoryNumber: `I-${suffix}`, barcode: `BC-${suffix}`, homeBranchId: branch.id, currentBranchId: branch.id, currentLocationId: location.id } });
  const instance2 = await tx.productInstance.create({ data: { organizationId: organization.id, productVariantId: serialVariant.id, inventoryNumber: `I2-${suffix}`, barcode: `BC2-${suffix}`, homeBranchId: branch.id, currentBranchId: branch.id, currentLocationId: location.id } });
  const sale = await tx.order.create({ data: { organizationId: organization.id, orderNumber: `S-${suffix}`, branchId: branch.id, customerId: customer.id, type: "SALE", channel: "CRM", status: "CONFIRMED", currency: "KZT", totalMinor: BigInt(1000) } });
  const saleBulkItem = await tx.orderItem.create({ data: { organizationId: organization.id, orderId: sale.id, productVariantId: bulkVariant.id, quantity: 1, unitPriceMinor: BigInt(1000), lineTotalMinor: BigInt(1000), currency: "KZT", productNameSnapshot: "Bulk", variantNameSnapshot: "M", skuSnapshot: bulkVariant.sku } });
  const saleSerialItem = await tx.orderItem.create({ data: { organizationId: organization.id, orderId: sale.id, productVariantId: serialVariant.id, quantity: 1, unitPriceMinor: BigInt(1000), lineTotalMinor: BigInt(1000), currency: "KZT", productNameSnapshot: "Serial", variantNameSnapshot: "M", skuSnapshot: serialVariant.sku } });
  return { organization, user, branch, location, membership, customer, bulkVariant, serialVariant, instance, instance2, sale, saleBulkItem, saleSerialItem, tenant: createTenantContext(organization.id) };
}

async function main() {
  console.log("SALE-1 stage: pure assertions");
  pass("non-overlapping rentals use peak", calculatePeakBlockedCapacity([{ from: at(2, 10), until: at(2, 12), quantity: 3 }, { from: at(2, 14), until: at(2, 16), quantity: 3 }], at(2, 10), at(2, 16)) === 3);
  pass("half-open boundaries", calculatePeakBlockedCapacity([{ from: at(2, 10), until: at(2, 12), quantity: 5 }, { from: at(2, 12), until: at(2, 14), quantity: 4 }], at(2, 10), at(2, 14)) === 5);
  pass("overdue remains open", calculatePeakBlockedCapacity(buildCapacitySegments([{ id: "a", sourceType: "ORDER", quantity: 2, blockedFrom: at(1), blockedUntil: at(2), issuedQuantity: 2, returnedQuantity: 0 }], "BULK"), at(3), null) === 2);
  pass("open maintenance remains blocked", calculatePeakBlockedCapacity(buildCapacitySegments([{ id: "m", sourceType: "MAINTENANCE", quantity: 2, blockedFrom: at(1), blockedUntil: at(2), issuedQuantity: 0, returnedQuantity: 0 }], "BULK"), at(3), null) === 2);
  pass("OWNER receives new permissions", defaultHasPermission("OWNER", "SALE_CONFIRM") && defaultHasPermission("OWNER", "SALE_FULFILL"));
  pass("SELLER not granted sale permissions", !defaultHasPermission("SELLER", "SALE_CONFIRM") && !defaultHasPermission("SELLER", "SALE_FULFILL"));
  pass("rental discount classified rental", revenueFamily({ kind: "DISCOUNT", sourceType: "ORDER_CHARGE", sourceId: "o", orderId: "o", order: { type: "RENTAL" }, reversalOf: null }) === "RENTAL");
  pass("sale discount excluded from rental", revenueFamily({ kind: "DISCOUNT", sourceType: "ORDER_CHARGE", sourceId: "o", orderId: "o", order: { type: "SALE" }, reversalOf: null }) === "SALE");
  pass("reversal inherits sale family", revenueFamily({ kind: "REVERSAL", sourceType: "CORRECTION", sourceId: null, orderId: "o", order: { type: "SALE" }, reversalOf: { kind: "DISCOUNT", sourceType: "ORDER_CHARGE", sourceId: "o", orderId: "o", order: { type: "SALE" } } }) === "SALE");

  try {
    console.log("SALE-1 stage: valid rollback transaction");
    await db.$transaction(async (tx) => {
      const f = await fixture(tx, "valid");
      const before = await getPermanentFleetReductionAvailabilityWithClient(tx, { tenant: f.tenant, branchId: f.branch.id, productVariantId: f.bulkVariant.id, quantity: 5, confirmedAt: at(1) });
      pass("zero commitments preserve capacity", before.canFulfill && before.availableCapacity === 5);
      const commitment = await tx.saleInventoryCommitment.create({ data: { organizationId: f.organization.id, orderId: f.sale.id, orderItemId: f.saleBulkItem.id, productVariantId: f.bulkVariant.id, branchId: f.branch.id, quantity: 1, idempotencyKey: `valid-${f.organization.id}`, provenance: "TEST", confirmedByUserId: f.user.id, confirmedAt: at(1) } });
      const after = await getVariantAvailabilityWithClient(tx, { tenant: f.tenant, branchId: f.branch.id, productVariantId: f.bulkVariant.id, requestedFrom: at(2), requestedUntil: at(3), requestedQuantity: 5 });
      pass("active commitment reduces availability", after.availableCapacity === 4 && !after.canFulfill);
      await tx.saleInventoryCommitment.update({ where: { id: commitment.id }, data: { status: "CANCELLED", terminalAt: at(1, 1), terminalByUserId: f.user.id, terminalReason: "test cancellation" } });
      const cancelled = await getVariantAvailabilityWithClient(tx, { tenant: f.tenant, branchId: f.branch.id, productVariantId: f.bulkVariant.id, requestedFrom: at(2), requestedUntil: at(3), requestedQuantity: 5 });
      pass("cancelled commitment releases capacity", cancelled.availableCapacity === 5);

      const rental = await tx.order.create({ data: { organizationId: f.organization.id, orderNumber: `R-${f.organization.id}`, branchId: f.branch.id, customerId: f.customer.id, type: "RENTAL", channel: "CRM", status: "CONFIRMED", currency: "KZT", rentalStartAt: at(5), rentalEndAt: at(6) } });
      const item = await tx.orderItem.create({ data: { organizationId: f.organization.id, orderId: rental.id, productVariantId: f.bulkVariant.id, quantity: 5, unitPriceMinor: BigInt(0), lineTotalMinor: BigInt(0), currency: "KZT", productNameSnapshot: "Bulk", variantNameSnapshot: "M", skuSnapshot: f.bulkVariant.sku } });
      await tx.capacityAllocation.create({ data: { organizationId: f.organization.id, orderId: rental.id, orderItemId: item.id, productVariantId: f.bulkVariant.id, branchId: f.branch.id, quantity: 5, sourceType: "ORDER", blockedFrom: at(5), blockedUntil: at(6) } });
      const permanent = await getPermanentFleetReductionAvailabilityWithClient(tx, { tenant: f.tenant, branchId: f.branch.id, productVariantId: f.bulkVariant.id, quantity: 1, confirmedAt: at(2) });
      pass("future full rental rejects fleet reduction", !permanent.canFulfill && permanent.availableCapacity === 0);

      const charge = await tx.financialTransaction.create({ data: { organizationId: f.organization.id, branchId: f.branch.id, customerId: f.customer.id, orderId: f.sale.id, kind: "SALE_CHARGE", amountMinor: BigInt(1000), ...effectsFor("SALE_CHARGE", BigInt(1000)), currency: "KZT", sourceType: "ORDER_CHARGE", sourceId: f.sale.id, idempotencyKey: `charge-${f.organization.id}` } });
      await tx.financialTransaction.create({ data: { organizationId: f.organization.id, branchId: f.branch.id, customerId: f.customer.id, orderId: f.sale.id, kind: "REVERSAL", amountMinor: BigInt(1000), obligationEffectMinor: BigInt(-1000), cashEffectMinor: BigInt(0), revenueEffectMinor: BigInt(-1000), depositEffectMinor: BigInt(0), currency: "KZT", sourceType: "SALE_CORRECTION", sourceId: f.sale.id, idempotencyKey: `reversal-${f.organization.id}`, reason: "test correction", reversalOfId: charge.id } });
      const sync = await synchronizeOrderChargeWithClient(tx, f.tenant, f.sale.id, { userId: f.user.id, membershipId: f.membership.id }, BigInt(0));
      pass("charge sync includes reversal by original provenance", sync === null);
      throw rollback;
    }, { maxWait: 10000, timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }

  console.log("SALE-1 stage: DB rejection assertions");
  try {
    await db.$transaction(async (tx) => {
      const f = await fixture(tx, "db-guards");
      const values = [f.organization.id, f.sale.id, f.saleBulkItem.id, f.bulkVariant.id, f.branch.id, f.saleSerialItem.id, f.serialVariant.id, f.instance.id, f.user.id];
      await tx.$executeRawUnsafe(`DO $sale_test$
      DECLARE rejected boolean; c uuid;
      BEGIN
        rejected:=false; BEGIN INSERT INTO sale_inventory_commitments(organization_id,order_id,order_item_id,product_variant_id,branch_id,quantity,idempotency_key,provenance) VALUES('${values[0]}','${values[1]}','${values[2]}','${values[3]}','${values[4]}',0,'bad-q','TEST'); EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'invalid quantity accepted'; END IF;
        rejected:=false; BEGIN INSERT INTO sale_inventory_commitments(organization_id,order_id,order_item_id,product_variant_id,branch_id,quantity,idempotency_key,provenance) VALUES('${values[0]}','${values[1]}','${values[2]}','${values[3]}','${values[4]}',2,'over-item','TEST'); EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'order item overcommit accepted'; END IF;
        rejected:=false; BEGIN INSERT INTO sale_inventory_commitments(organization_id,order_id,order_item_id,product_variant_id,branch_id,quantity,status,idempotency_key,provenance,terminal_at,terminal_by_user_id,terminal_reason) VALUES('${values[0]}','${values[1]}','${values[2]}','${values[3]}','${values[4]}',1,'CANCELLED','terminal-create','TEST',now(),'${values[8]}','invalid'); EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'terminal commitment insert accepted'; END IF;
        rejected:=false; BEGIN INSERT INTO sale_inventory_commitments(organization_id,order_id,order_item_id,product_variant_id,product_instance_id,branch_id,quantity,idempotency_key,provenance) VALUES('${values[0]}','${values[1]}','${values[2]}','${values[3]}','${values[7]}','${values[4]}',1,'bad-bulk','TEST'); EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'BULK instance accepted'; END IF;
        rejected:=false; BEGIN INSERT INTO sale_inventory_commitments(organization_id,order_id,order_item_id,product_variant_id,product_instance_id,branch_id,quantity,idempotency_key,provenance) VALUES('${values[0]}','${values[1]}','${values[5]}','${values[6]}','${values[7]}','${values[4]}',2,'bad-serial','TEST'); EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'SERIALIZED quantity accepted'; END IF;
        INSERT INTO sale_inventory_commitments(organization_id,order_id,order_item_id,product_variant_id,product_instance_id,branch_id,quantity,idempotency_key,provenance) VALUES('${values[0]}','${values[1]}','${values[5]}','${values[6]}','${values[7]}','${values[4]}',1,'serial-one','TEST') RETURNING id INTO c;
        rejected:=false; BEGIN INSERT INTO sale_inventory_commitments(organization_id,order_id,order_item_id,product_variant_id,product_instance_id,branch_id,quantity,idempotency_key,provenance) VALUES('${values[0]}','${values[1]}','${values[5]}','${values[6]}','${values[7]}','${values[4]}',1,'serial-two','TEST'); EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'duplicate active instance accepted'; END IF;
        rejected:=false; BEGIN INSERT INTO inventory_movements(organization_id,product_variant_id,type,quantity,from_branch_id,source_type,idempotency_key) VALUES('${values[0]}','${values[3]}','SALE_ISSUE',-1,'${values[4]}','SALE_COMMITMENT','bad-movement'); EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'unlinked SALE_ISSUE accepted'; END IF;
        UPDATE sale_inventory_commitments SET status='CANCELLED',terminal_at=now(),terminal_by_user_id='${values[8]}',terminal_reason='test' WHERE id=c;
        rejected:=false; BEGIN UPDATE sale_inventory_commitments SET terminal_reason='changed' WHERE id=c; EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'terminal mutation accepted'; END IF;
        rejected:=false; BEGIN DELETE FROM sale_inventory_commitments WHERE id=c; EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'history delete accepted'; END IF;
      END $sale_test$`);
      ["invalid quantity rejected","order item overcommit rejected","terminal insert rejected","BULK instance rejected","SERIALIZED quantity rejected","duplicate active instance rejected","SALE_ISSUE requires commitment","terminal commitment immutable","commitment history cannot delete"].forEach((name) => pass(name, true));
      throw rollback;
    }, { maxWait: 10000, timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }

  console.log(`SALE-1 targeted: ${passed.length}/${passed.length} passed`);
}

main().finally(() => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
