import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { db } from "../lib/db";
import { createTenantContext } from "../lib/tenant/context";
import { createSaleDraft, confirmSale, fulfillSale, cancelSale } from "../lib/sales/lifecycle";
import { getVariantAvailabilityWithClient } from "../lib/availability/capacity";
import { createFinancialTransactionWithClient } from "../lib/finance/transactions";
import { effectsFor } from "../lib/finance/effects";

const passed: string[] = [];
const pass = (name: string, condition: unknown) => { if (!condition) throw new Error(`FAIL ${name}`); passed.push(name); };
const rejects = async (operation: () => Promise<unknown>) => { try { await operation(); return false; } catch { return true; } };
const rollback = new Error("SALE_2_ROLLBACK");

async function fixture(tx: Prisma.TransactionClient) {
  const suffix = randomUUID().slice(0, 8);
  const organization = await tx.organization.create({ data: { name: "SALE-2", slug: `sale-2-${suffix}` } });
  const user = await tx.user.create({ data: { email: `sale-2-${suffix}@example.test`, displayName: "Owner", passwordHash: "test" } });
  const branch = await tx.branch.create({ data: { organizationId: organization.id, name: "Branch", code: "S2", city: "Test", timezone: "UTC" } });
  const locationA = await tx.location.create({ data: { organizationId: organization.id, branchId: branch.id, name: "A", code: "A", type: "SHOWROOM" } });
  const locationB = await tx.location.create({ data: { organizationId: organization.id, branchId: branch.id, name: "B", code: "B", type: "WAREHOUSE" } });
  const membership = await tx.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER", status: "ACTIVE", defaultBranchId: branch.id } });
  const customer = await tx.customer.create({ data: { organizationId: organization.id, customerNumber: `C-${suffix}`, firstName: "Customer" } });
  const size = await tx.size.create({ data: { organizationId: organization.id, code: `M-${suffix}`, name: "M" } });
  const bulkProduct = await tx.product.create({ data: { organizationId: organization.id, name: "Bulk", internalCode: `B-${suffix}`, trackingMode: "BULK", isSellable: true } });
  const serialProduct = await tx.product.create({ data: { organizationId: organization.id, name: "Serial", internalCode: `S-${suffix}`, trackingMode: "SERIALIZED", isSellable: true } });
  const zeroProduct = await tx.product.create({ data: { organizationId: organization.id, name: "Zero", internalCode: `Z-${suffix}`, trackingMode: "BULK", isSellable: true } });
  const bulk = await tx.productVariant.create({ data: { organizationId: organization.id, productId: bulkProduct.id, sizeId: size.id, sku: `B-${suffix}` } });
  const serial = await tx.productVariant.create({ data: { organizationId: organization.id, productId: serialProduct.id, sizeId: size.id, sku: `S-${suffix}` } });
  const zero = await tx.productVariant.create({ data: { organizationId: organization.id, productId: zeroProduct.id, sizeId: size.id, sku: `Z-${suffix}` } });
  const now = new Date("2026-01-01T00:00:00Z");
  await tx.productPrice.createMany({ data: [{ organizationId: organization.id, productVariantId: bulk.id, type: "SALE", amountMinor: BigInt(1000), currency: "KZT", validFrom: now }, { organizationId: organization.id, productVariantId: serial.id, type: "SALE", amountMinor: BigInt(2000), currency: "KZT", validFrom: now }, { organizationId: organization.id, productVariantId: zero.id, type: "SALE", amountMinor: BigInt(0), currency: "KZT", validFrom: now }] });
  await tx.stockLevel.createMany({ data: [{ organizationId: organization.id, productVariantId: bulk.id, branchId: branch.id, locationId: locationA.id, quantity: 2 }, { organizationId: organization.id, productVariantId: bulk.id, branchId: branch.id, locationId: locationB.id, quantity: 2 }, { organizationId: organization.id, productVariantId: zero.id, branchId: branch.id, locationId: locationA.id, quantity: 1 }] });
  const instance = await tx.productInstance.create({ data: { organizationId: organization.id, productVariantId: serial.id, inventoryNumber: `I-${suffix}`, barcode: `BC-${suffix}`, homeBranchId: branch.id, currentBranchId: branch.id, currentLocationId: locationA.id } });
  return { organization, user, membership, branch, locationA, locationB, customer, bulk, serial, zero, instance, tenant: createTenantContext(organization.id), actor: { userId: user.id, membershipId: membership.id, role: "OWNER" as const } };
}

async function main() {
  try {
    await db.$transaction(async (tx) => {
      const f = await fixture(tx);
      const draft = await createSaleDraft(f.tenant, { branchId: f.branch.id, customerId: f.customer.id, channel: "CRM", idempotencyKey: "draft-main", items: [{ productVariantId: f.bulk.id, quantity: 3 }, { productVariantId: f.serial.id, quantity: 1 }] }, f.actor, tx);
      const draftReplay = await createSaleDraft(f.tenant, { branchId: f.branch.id, customerId: f.customer.id, channel: "CRM", idempotencyKey: "draft-main", items: [{ productVariantId: f.bulk.id, quantity: 3 }, { productVariantId: f.serial.id, quantity: 1 }] }, f.actor, tx);
      pass("sale draft created", draft.type === "SALE" && draft.status === "DRAFT");
      pass("draft idempotent replay", draftReplay.id === draft.id);
      pass("draft conflicting replay", await rejects(() => createSaleDraft(f.tenant, { branchId: f.branch.id, customerId: f.customer.id, channel: "CRM", idempotencyKey: "draft-main", items: [{ productVariantId: f.bulk.id, quantity: 2 }] }, f.actor, tx)));
      const items = await tx.orderItem.findMany({ where: { orderId: draft.id }, orderBy: { unitPriceMinor: "asc" } });
      pass("multiple sale items", items.length === 2);
      pass("canonical sale price snapshots", items[0]?.unitPriceMinor === BigInt(1000) && items[1]?.unitPriceMinor === BigInt(2000));
      pass("draft has no commitments", await tx.saleInventoryCommitment.count({ where: { orderId: draft.id } }) === 0);
      pass("draft has no charge", await tx.financialTransaction.count({ where: { orderId: draft.id } }) === 0);
      pass("draft leaves stock unchanged", (await tx.stockLevel.aggregate({ where: { productVariantId: f.bulk.id }, _sum: { quantity: true } }))._sum.quantity === 4);
      const bulkItem = items.find((item) => item.productVariantId === f.bulk.id)!;
      const serialItem = items.find((item) => item.productVariantId === f.serial.id)!;
      const before = await getVariantAvailabilityWithClient(tx, { tenant: f.tenant, branchId: f.branch.id, productVariantId: f.bulk.id, requestedFrom: new Date("2027-02-01"), requestedUntil: new Date("2027-02-02"), requestedQuantity: 4 });
      await confirmSale(f.tenant, draft.id, [{ orderItemId: serialItem.id, productInstanceIds: [f.instance.id] }], "confirm-main", f.actor, tx);
      pass("bulk commitment exact", (await tx.saleInventoryCommitment.findFirstOrThrow({ where: { orderItemId: bulkItem.id } })).quantity === 3);
      pass("serialized exact commitment", (await tx.saleInventoryCommitment.findFirstOrThrow({ where: { orderItemId: serialItem.id } })).productInstanceId === f.instance.id);
      pass("confirmation creates charge once", await tx.financialTransaction.count({ where: { orderId: draft.id, kind: "SALE_CHARGE" } }) === 1);
      const confirmedReplay = await confirmSale(f.tenant, draft.id, [{ orderItemId: serialItem.id, productInstanceIds: [f.instance.id] }], "confirm-main", f.actor, tx);
      pass("confirmation replay", confirmedReplay.status === "CONFIRMED" && await tx.saleInventoryCommitment.count({ where: { orderId: draft.id } }) === 2);
      pass("confirmation conflict", await rejects(() => confirmSale(f.tenant, draft.id, [{ orderItemId: serialItem.id, productInstanceIds: [f.instance.id] }], "different-confirm", f.actor, tx)));
      const afterConfirm = await getVariantAvailabilityWithClient(tx, { tenant: f.tenant, branchId: f.branch.id, productVariantId: f.bulk.id, requestedFrom: new Date("2027-02-01"), requestedUntil: new Date("2027-02-02"), requestedQuantity: 4 });
      pass("active commitment reduces capacity", before.availableCapacity - afterConfirm.availableCapacity === 3);
      const retiredBefore = f.instance.retiredAt;
      await fulfillSale(f.tenant, draft.id, "fulfill-main", f.actor, tx);
      const completed = await tx.order.findUniqueOrThrow({ where: { id: draft.id } });
      pass("full handover completes sale", completed.status === "COMPLETED");
      pass("bulk stock decremented once", (await tx.stockLevel.aggregate({ where: { productVariantId: f.bulk.id }, _sum: { quantity: true } }))._sum.quantity === 1);
      pass("multiple stock locations supported", await tx.inventoryMovement.count({ where: { saleInventoryCommitment: { orderItemId: bulkItem.id }, type: "SALE_ISSUE" } }) === 2);
      pass("all commitments fulfilled", await tx.saleInventoryCommitment.count({ where: { orderId: draft.id, status: "FULFILLED" } }) === 2);
      const sold = await tx.productInstance.findUniqueOrThrow({ where: { id: f.instance.id } });
      pass("serialized becomes sold", sold.operationalStatus === "SOLD");
      pass("sold preserves retiredAt", sold.retiredAt === retiredBefore);
      pass("serialized status history", await tx.instanceStatusHistory.count({ where: { productInstanceId: f.instance.id, toStatus: "SOLD" } }) === 1);
      pass("sale issue exact provenance", (await tx.inventoryMovement.aggregate({ where: { saleInventoryCommitment: { orderId: draft.id }, type: "SALE_ISSUE" }, _sum: { quantity: true } }))._sum.quantity === -4);
      const afterFulfill = await getVariantAvailabilityWithClient(tx, { tenant: f.tenant, branchId: f.branch.id, productVariantId: f.bulk.id, requestedFrom: new Date("2027-02-01"), requestedUntil: new Date("2027-02-02"), requestedQuantity: 4 });
      pass("effective capacity unchanged by handover", afterFulfill.availableCapacity === afterConfirm.availableCapacity);
      await fulfillSale(f.tenant, draft.id, "fulfill-main", f.actor, tx);
      pass("fulfillment replay no duplicate", await tx.inventoryMovement.count({ where: { saleInventoryCommitment: { orderId: draft.id }, type: "SALE_ISSUE" } }) === 3);
      pass("payment not required", (await tx.financialTransaction.aggregate({ where: { orderId: draft.id }, _sum: { cashEffectMinor: true } }))._sum.cashEffectMinor === BigInt(0));
      const fulfilledCommitment = await tx.saleInventoryCommitment.findFirstOrThrow({ where: { orderId: draft.id, productInstanceId: null } });
      const fulfilledMovement = await tx.inventoryMovement.findFirstOrThrow({ where: { saleInventoryCommitmentId: fulfilledCommitment.id } });
      await tx.$executeRawUnsafe(`DO $do$ DECLARE rejected boolean:=false; BEGIN BEGIN INSERT INTO inventory_movements(organization_id,product_variant_id,type,quantity,from_branch_id,source_type,source_id,idempotency_key,sale_inventory_commitment_id) VALUES('${f.organization.id}','${fulfilledCommitment.productVariantId}','SALE_ISSUE',-1,'${f.branch.id}','SALE_COMMITMENT','${fulfilledCommitment.id}','over-${randomUUID()}','${fulfilledCommitment.id}'); EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'duplicate SALE_ISSUE accepted'; END IF; END $do$`);
      pass("direct duplicate fulfillment rejected", true);
      await tx.$executeRawUnsafe(`DO $do$ DECLARE rejected boolean:=false; BEGIN BEGIN DELETE FROM inventory_movements WHERE id='${fulfilledMovement.id}'; EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'SALE_ISSUE delete accepted'; END IF; END $do$`);
      pass("sale issue history immutable", true);
      await tx.$executeRawUnsafe(`DO $do$ DECLARE rejected boolean:=false; BEGIN BEGIN UPDATE orders SET total_minor=total_minor+1 WHERE id='${draft.id}'; EXCEPTION WHEN OTHERS THEN rejected:=true; END; IF NOT rejected THEN RAISE EXCEPTION 'completed sale commercial edit accepted'; END IF; END $do$`);
      pass("completed commercial state immutable", true);

      const draftCancel = await createSaleDraft(f.tenant, { branchId: f.branch.id, customerId: f.customer.id, channel: "CRM", idempotencyKey: "draft-cancel", items: [{ productVariantId: f.zero.id, quantity: 1 }] }, f.actor, tx);
      await cancelSale(f.tenant, draftCancel.id, "Клиент отказался", "cancel-draft", f.actor, tx);
      pass("draft cancellation", (await tx.order.findUniqueOrThrow({ where: { id: draftCancel.id } })).status === "CANCELLED");
      pass("draft cancellation no finance", await tx.financialTransaction.count({ where: { orderId: draftCancel.id } }) === 0);

      const zeroSale = await createSaleDraft(f.tenant, { branchId: f.branch.id, customerId: f.customer.id, channel: "CRM", idempotencyKey: "zero-sale", items: [{ productVariantId: f.zero.id, quantity: 1 }] }, f.actor, tx);
      await confirmSale(f.tenant, zeroSale.id, [], "zero-confirm", f.actor, tx);
      pass("zero sale has commitment", await tx.saleInventoryCommitment.count({ where: { orderId: zeroSale.id } }) === 1);
      pass("zero sale has no zero charge", await tx.financialTransaction.count({ where: { orderId: zeroSale.id } }) === 0);
      const zeroStock = (await tx.stockLevel.findFirstOrThrow({ where: { productVariantId: f.zero.id } })).quantity;
      await cancelSale(f.tenant, zeroSale.id, "Отмена до выдачи", "zero-cancel", f.actor, tx);
      pass("confirmed cancellation releases commitment", await tx.saleInventoryCommitment.count({ where: { orderId: zeroSale.id, status: "CANCELLED" } }) === 1);
      pass("cancellation leaves stock unchanged", (await tx.stockLevel.findFirstOrThrow({ where: { productVariantId: f.zero.id } })).quantity === zeroStock);

      const paid = await createSaleDraft(f.tenant, { branchId: f.branch.id, customerId: f.customer.id, channel: "CRM", idempotencyKey: "paid-sale", items: [{ productVariantId: f.bulk.id, quantity: 1 }] }, f.actor, tx);
      await confirmSale(f.tenant, paid.id, [], "paid-confirm", f.actor, tx);
      const payment = await createFinancialTransactionWithClient(tx, f.tenant, "PAYMENT_RECEIVED", { branchId: f.branch.id, customerId: f.customer.id, orderId: paid.id, amountMinor: BigInt(1000), currency: "KZT", paymentMethodId: (await tx.paymentMethod.create({ data: { organizationId: f.organization.id, code: "CASH_TEST", displayName: "Cash" } })).id, sourceType: "ORDER_PAYMENT", sourceId: paid.id, idempotencyKey: "paid-payment", reason: undefined }, f.actor, effectsFor("PAYMENT_RECEIVED", BigInt(1000)));
      pass("paid cancellation rejected", await rejects(() => cancelSale(f.tenant, paid.id, "Отмена продажи", "paid-cancel", f.actor, tx)));
      await createFinancialTransactionWithClient(tx, f.tenant, "CUSTOMER_REFUND", { branchId: f.branch.id, customerId: f.customer.id, orderId: paid.id, amountMinor: BigInt(1000), currency: "KZT", paymentMethodId: payment.paymentMethodId!, sourceType: "ORDER_REFUND", sourceId: paid.id, idempotencyKey: "paid-refund", reason: "Возврат оплаты" }, f.actor, effectsFor("CUSTOMER_REFUND", BigInt(1000)), payment.id);
      await cancelSale(f.tenant, paid.id, "Отмена продажи", "paid-cancel", f.actor, tx);
      pass("refund then cancellation succeeds", (await tx.order.findUniqueOrThrow({ where: { id: paid.id } })).status === "CANCELLED");
      pass("commercial cancellation uses discount", await tx.financialTransaction.count({ where: { orderId: paid.id, kind: "DISCOUNT" } }) === 1);
      pass("completed cancellation rejected", await rejects(() => cancelSale(f.tenant, draft.id, "Нельзя отменить", "completed-cancel", f.actor, tx)));
      pass("audit lifecycle", await tx.auditLog.count({ where: { organizationId: f.organization.id, action: { in: ["SALE_DRAFT_CREATED", "SALE_CONFIRMED", "SALE_FULFILLED", "SALE_CANCELLED"] } } }) >= 4);
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      pass("deferred DB integrity", true);
      throw rollback;
    }, { maxWait: 30_000, timeout: 180_000 });
  } catch (error) { if (error !== rollback) throw error; }
  pass("transactional fixture cleanup", await db.organization.count({ where: { slug: { startsWith: "sale-2-" } } }) === 0);
  console.log(`SALE-2 targeted: ${passed.length}/${passed.length} passed`);
  console.log(passed);
}

main().finally(() => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
