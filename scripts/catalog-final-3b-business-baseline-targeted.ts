import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { catalogBusinessBaselineEquals, readCatalogBusinessBaseline } from "../lib/catalog/full-import-business-baseline";

const rollback = new Error("CATALOG_FINAL_3B_BASELINE_ROLLBACK");
const passed: string[] = [];
const pass = (name: string, value: unknown) => { if (!value) throw new Error(`FAIL ${name}`); passed.push(name); };

async function main() {
  try {
    await db.$transaction(async tx => {
      const suffix = randomUUID().slice(0, 8);
      const organization = await tx.organization.create({ data: { name: "Catalog baseline test", slug: `catalog-baseline-${suffix}` } });
      const branch = await tx.branch.create({ data: { organizationId: organization.id, name: "Astana", code: `B${suffix.slice(0, 4)}`, city: "Astana", timezone: "Asia/Almaty" } });
      const customer = await tx.customer.create({ data: { organizationId: organization.id, customerNumber: `C-${suffix}`, firstName: "Baseline" } });
      const supplier = await tx.supplier.create({ data: { organizationId: organization.id, name: `Supplier ${suffix}` } });
      const paymentMethod = await tx.paymentMethod.create({ data: { organizationId: organization.id, code: "CASH", displayName: "Cash" } });
      const orders = await Promise.all([1, 2].map(number => tx.order.create({ data: { organizationId: organization.id, orderNumber: `O-${number}-${suffix}`, branchId: branch.id, customerId: customer.id, type: "RENTAL", channel: "CRM", status: "DRAFT", currency: "KZT" } })));
      const purchase = await tx.purchase.create({ data: { organizationId: organization.id, purchaseNumber: `P-${suffix}`, supplierId: supplier.id, destinationBranchId: branch.id, currency: "KZT", creationIdempotencyKey: `purchase-${suffix}` } });
      const finance = await tx.financialTransaction.create({ data: { organizationId: organization.id, branchId: branch.id, customerId: customer.id, orderId: orders[0].id, kind: "PAYMENT_RECEIVED", amountMinor: 100, obligationEffectMinor: -100, cashEffectMinor: 100, revenueEffectMinor: 0, depositEffectMinor: 0, currency: "KZT", paymentMethodId: paymentMethod.id, sourceType: "BASELINE_TEST", idempotencyKey: `finance-${suffix}` } });
      const baseline = await readCatalogBusinessBaseline(tx, organization.id);
      pass("A pre-existing 2/1/1 unchanged passes", baseline.orders.count === 2 && baseline.purchases.count === 1 && baseline.financialTransactions.count === 1 && catalogBusinessBaselineEquals(baseline, await readCatalogBusinessBaseline(tx, organization.id)));

      await tx.$executeRawUnsafe("SAVEPOINT added_order");
      await tx.order.create({ data: { organizationId: organization.id, orderNumber: `O-3-${suffix}`, branchId: branch.id, customerId: customer.id, type: "RENTAL", channel: "CRM", status: "DRAFT", currency: "KZT" } });
      pass("B additional Order fails", !catalogBusinessBaselineEquals(baseline, await readCatalogBusinessBaseline(tx, organization.id)));
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT added_order");

      await tx.$executeRawUnsafe("SAVEPOINT mutated_order");
      await tx.order.update({ where: { id: orders[0].id }, data: { internalComment: "unexpected mutation" } });
      const mutatedOrder = await readCatalogBusinessBaseline(tx, organization.id);
      pass("C same-count Order mutation fails", mutatedOrder.orders.count === 2 && !catalogBusinessBaselineEquals(baseline, mutatedOrder));
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT mutated_order");

      pass("D pre-existing Purchase unchanged passes", catalogBusinessBaselineEquals(baseline, await readCatalogBusinessBaseline(tx, organization.id)));
      await tx.$executeRawUnsafe("SAVEPOINT added_purchase");
      await tx.purchase.create({ data: { organizationId: organization.id, purchaseNumber: `P-2-${suffix}`, supplierId: supplier.id, destinationBranchId: branch.id, currency: "KZT", creationIdempotencyKey: `purchase-2-${suffix}` } });
      pass("E additional Purchase fails", !catalogBusinessBaselineEquals(baseline, await readCatalogBusinessBaseline(tx, organization.id)));
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT added_purchase");
      await tx.$executeRawUnsafe("SAVEPOINT mutated_purchase");
      await tx.purchase.update({ where: { id: purchase.id }, data: { note: "unexpected mutation" } });
      const mutatedPurchase = await readCatalogBusinessBaseline(tx, organization.id);
      pass("E same-count Purchase mutation fails", mutatedPurchase.purchases.count === 1 && !catalogBusinessBaselineEquals(baseline, mutatedPurchase));
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT mutated_purchase");

      pass("F pre-existing FinancialTransaction unchanged passes", catalogBusinessBaselineEquals(baseline, await readCatalogBusinessBaseline(tx, organization.id)));
      await tx.$executeRawUnsafe("SAVEPOINT added_finance");
      await tx.financialTransaction.create({ data: { organizationId: organization.id, branchId: branch.id, customerId: customer.id, kind: "PAYMENT_RECEIVED", amountMinor: 50, obligationEffectMinor: -50, cashEffectMinor: 50, revenueEffectMinor: 0, depositEffectMinor: 0, currency: "KZT", paymentMethodId: paymentMethod.id, sourceType: "BASELINE_TEST", idempotencyKey: `finance-2-${suffix}` } });
      pass("G additional FinancialTransaction fails", !catalogBusinessBaselineEquals(baseline, await readCatalogBusinessBaseline(tx, organization.id)));
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT added_finance");
      const syntheticMutation = { ...baseline, financialTransactions: { ...baseline.financialTransactions, sha256: "0".repeat(64) } };
      pass("G same-count FinancialTransaction mutation fails", !catalogBusinessBaselineEquals(baseline, syntheticMutation));
      pass("financial ledger row remains immutable", await tx.financialTransaction.findUnique({ where: { id: finance.id } }).then(row => row?.reason === null));
      throw rollback;
    }, { timeout: 120000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  console.log(`CATALOG FINAL-3B business baseline: ${passed.length}/${passed.length} passed`);
  console.log(passed);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
