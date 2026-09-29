import "dotenv/config";
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";

type Check = { name: string; ms: number };
const timed = async <T>(name: string, run: () => Promise<T>): Promise<[T, Check]> => {
  const started = performance.now();
  const value = await run();
  return [value, { name, ms: Math.round(performance.now() - started) }];
};

async function main() {
  const require = createRequire(import.meta.url);
  const serverOnly = require.resolve("server-only");
  require.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {}, children: [], paths: [] } as unknown as NodeJS.Module;

  const [{ db }, { createTenantContext }, orders, finance, settlement, inventory, movements, returns, permissions] = await Promise.all([
    import("../lib/db"),
    import("../lib/tenant/context"),
    import("../lib/orders/queries"),
    import("../lib/finance/queries"),
    import("../lib/finance/order-settlement"),
    import("../lib/inventory/queries"),
    import("../lib/inventory/movements"),
    import("../lib/fulfillment/return-intake"),
    import("../lib/permissions/effective"),
  ]);

  const orderId = "37398f24-5c1e-42ba-acf4-758f6129491b";
  const orderIdentity = await db.order.findUnique({ where: { id: orderId }, select: { organizationId: true } });
  assert.ok(orderIdentity, "R-000003 exists");
  const membership = await db.organizationMembership.findFirst({
    where: { organizationId: orderIdentity.organizationId, status: "ACTIVE", role: "OWNER", user: { status: "ACTIVE" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true },
  });
  assert.ok(membership, "active diagnostic membership exists");
  const tenant = createTenantContext(orderIdentity.organizationId);
  const actor = { organizationId: orderIdentity.organizationId, membershipId: membership.id, role: membership.role };
  const financeActor = { membershipId: membership.id, role: membership.role };

  const controls = async () => {
    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, items: { select: { status: true } }, capacityAllocations: { select: { issuedQuantity: true, returnedQuantity: true, returnedAt: true } } },
    });
    const [stock, movementsCount, financeCount] = await Promise.all([
      db.stockLevel.aggregate({ where: { organizationId: orderIdentity.organizationId }, _sum: { quantity: true } }),
      db.inventoryMovement.count({ where: { organizationId: orderIdentity.organizationId } }),
      db.financialTransaction.count({ where: { organizationId: orderIdentity.organizationId } }),
    ]);
    return JSON.stringify({ order, stock: stock._sum.quantity ?? 0, movementsCount, financeCount });
  };

  const before = await controls();
  const checks: Check[] = [];
  const orderList = () => Promise.all([
    orders.getOrderFormOptions(tenant),
    orders.getOrders(tenant, {}),
    permissions.getEffectivePermissions(actor),
  ]).then(() => undefined);
  const warehouse = () => Promise.all([
    inventory.getInventoryItems({ tenant }),
    movements.getWarehouseSummary(tenant),
  ]).then(() => undefined);
  const returnIntake = () => returns.getRentalReturnIntake(tenant, orderId).then((result) => {
    assert.equal(result.order.orderNumber, "R-000003");
  });
  const orderDetail = async () => {
    const order = await orders.getOrder(tenant, orderId);
    assert.ok(order);
    await Promise.all([
      finance.getOrderPaymentDetails(tenant, orderId, financeActor),
      finance.getOrderDepositDetails(tenant, orderId, financeActor),
      finance.getOrderDamageDetails(tenant, orderId, financeActor),
      settlement.getOrderReturnSettlement(tenant, orderId, financeActor),
    ]);
  };

  for (const [name, run] of [["orders", orderList], ["order-detail", orderDetail], ["warehouse", warehouse], ["return-intake", returnIntake]] as const) {
    const [, result] = await timed(name, run);
    checks.push(result);
  }
  const [, concurrent] = await timed("bounded-concurrent-orders-warehouse-return", async () => {
    const results = await Promise.allSettled([orderList(), warehouse(), returnIntake()]);
    assert.equal(results.filter((result) => result.status === "rejected").length, 0);
  });
  checks.push(concurrent);

  const after = await controls();
  assert.equal(after, before, "read-only page compositions do not mutate controls");
  console.log(JSON.stringify({ result: "PASS", checks, controlsUnchanged: true }));
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
});
