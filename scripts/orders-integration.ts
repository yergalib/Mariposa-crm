import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "../lib/db";
import { createTenantContext } from "../lib/tenant/context";
import {
  addOrderItem,
  cancelOrder,
  confirmOrder,
  createOrder,
  removeOrderItem,
  reserveOrder,
  updateOrder,
  updateOrderItem,
} from "../lib/orders/management";
import { getCustomerOrders, getOrder, getOrders } from "../lib/orders/queries";
import { canPerformOrderAction } from "../lib/auth/access";
const anchor = Date.now(),
  ok = new Map<string, boolean>(),
  mark = (k: string, v = true) => {
    ok.set(k, v);
    if (!v) throw new Error(`FAIL ${k}`);
  },
  future = (days: number) => {
    const value = new Date(anchor + days * 86400000);
    value.setMilliseconds(0);
    return value;
  },
  ids: string[] = [];
async function cleanup() {
  for (const org of ids) {
    await db
      .$transaction(async (tx) => {
        await tx.capacityAllocation.deleteMany({
          where: { organizationId: org },
        });
        await tx.orderEvent.deleteMany({ where: { organizationId: org } });
        await tx.orderItem.deleteMany({ where: { organizationId: org } });
        await tx.order.deleteMany({ where: { organizationId: org } });
        await tx.orderCounter.deleteMany({ where: { organizationId: org } });
        await tx.productPrice.deleteMany({ where: { organizationId: org } });
        await tx.stockLevel.deleteMany({ where: { organizationId: org } });
        await tx.productInstance.deleteMany({ where: { organizationId: org } });
        await tx.productVariant.deleteMany({ where: { organizationId: org } });
        await tx.product.deleteMany({ where: { organizationId: org } });
        await tx.size.deleteMany({ where: { organizationId: org } });
        await tx.category.deleteMany({ where: { organizationId: org } });
        await tx.customerContact.deleteMany({ where: { organizationId: org } });
        await tx.customer.deleteMany({ where: { organizationId: org } });
        await tx.location.deleteMany({ where: { organizationId: org } });
        await tx.branch.deleteMany({ where: { organizationId: org } });
        await tx.organizationSettings.deleteMany({
          where: { organizationId: org },
        });
        await tx.organization.delete({ where: { id: org } });
      })
      .catch(() => {});
  }
}
async function tenant(s: string) {
  const org = await db.organization.create({
    data: {
      name: `Order Test ${s}`,
      slug: `order-test-${s}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timezone: "Asia/Almaty",
      settings: { create: { turnaroundBufferMinutes: 60 } },
    },
  });
  ids.push(org.id);
  const branch = await db.branch.create({
      data: {
        organizationId: org.id,
        name: "Test Branch",
        code: "T",
        city: "Test",
        timezone: "Asia/Almaty",
      },
    }),
    location = await db.location.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        name: "Main",
        code: "M",
        type: "SHOWROOM",
      },
    }),
    customer = await db.customer.create({
      data: {
        organizationId: org.id,
        customerNumber: "C-TEST",
        firstName: "Alice",
        lastName: "Order",
        source: "CRM",
        contacts: {
          create: {
            organizationId: org.id,
            type: "PHONE",
            value: "+77000000000",
            normalizedValue: "+77000000000",
            isPrimary: true,
          },
        },
      },
    }),
    size = await db.size.create({
      data: { organizationId: org.id, code: "M", name: "M" },
    }),
    category = await db.category.create({
      data: { organizationId: org.id, name: "Test", slug: "test" },
    });
  async function variant(
    mode: "SERIALIZED" | "BULK",
    code: string,
    capacity: number,
    buffer?: number,
  ) {
    const product = await db.product.create({
        data: {
          organizationId: org.id,
          categoryId: category.id,
          name: `Product ${code}`,
          internalCode: code,
          trackingMode: mode,
          turnaroundBufferMinutes: buffer ?? 0,
          publicationStatus: "ACTIVE",
        },
      }),
      v = await db.productVariant.create({
        data: {
          organizationId: org.id,
          productId: product.id,
          sizeId: size.id,
          sku: `${code}-M`,
        },
      });
    await db.productPrice.create({
      data: {
        organizationId: org.id,
        productVariantId: v.id,
        type: "RENTAL",
        amountMinor: BigInt(1000),
        currency: "KZT",
        validFrom: new Date(0),
      },
    });
    if (mode === "SERIALIZED")
      for (let i = 0; i < capacity; i++)
        await db.productInstance.create({
          data: {
            organizationId: org.id,
            productVariantId: v.id,
            inventoryNumber: `${code}-${i}`,
            barcode: `${code}B${i}`,
            homeBranchId: branch.id,
            currentBranchId: branch.id,
            currentLocationId: location.id,
          },
        });
    else
      await db.stockLevel.create({
        data: {
          organizationId: org.id,
          productVariantId: v.id,
          branchId: branch.id,
          locationId: location.id,
          quantity: capacity,
        },
      });
    return { product, v };
  }
  return {
    org,
    branch,
    customer,
    size,
    category,
    serialized: await variant("SERIALIZED", "SER", 2),
    single: await variant("SERIALIZED", "ONE", 1),
    buffered: await variant("SERIALIZED", "BUF", 1, 60),
    bulk: await variant("BULK", "BULK", 3),
  };
}
const base = (
  x: Awaited<ReturnType<typeof tenant>>,
  from = future(10),
  until = future(12),
) => ({
  branchId: x.branch.id,
  customerId: x.customer.id,
  source: "CRM",
  rentalStart: from,
  rentalEnd: until,
  discountMinor: BigInt(0),
  internalComment: null,
});
const item = (id: string, q = 1) => ({
  productVariantId: id,
  quantity: q,
  discountMinor: BigInt(0),
});
async function run() {
  const x = await tenant("a"),
    t = createTenantContext(x.org.id),
    y = await tenant("b"),
    other = createTenantContext(y.org.id);
  const a = await createOrder(t, base(x), [item(x.serialized.v.id)], {});
  mark("A", a.status === "DRAFT");
  mark("B", /^R-\d{6}$/.test(a.orderNumber));
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () =>
      createOrder(t, base(x), [item(x.serialized.v.id)], {}),
    ),
  );
  mark("C", new Set(concurrent.map((o) => o.orderNumber)).size === 5);
  let detail = await getOrder(t, a.id);
  mark("D", detail?.items.length === 1);
  mark("E", detail?.items[0].unitPriceMinor === BigInt(1000));
  await db.product.update({
    where: { id: x.serialized.product.id },
    data: { name: "Renamed" },
  });
  detail = await getOrder(t, a.id);
  mark("F", detail?.items[0].productNameSnapshot === "Product SER");
  await db.productPrice.updateMany({
    where: { productVariantId: x.serialized.v.id },
    data: { amountMinor: BigInt(9999) },
  });
  detail = await getOrder(t, a.id);
  mark("G", detail?.items[0].unitPriceMinor === BigInt(1000));
  mark("H", detail?.totalMinor === BigInt(1000));
  await updateOrder(t, a.id, { ...base(x), discountMinor: BigInt(100) }, {});
  detail = await getOrder(t, a.id);
  mark("I", detail?.totalMinor === BigInt(900));
  let invalid = false;
  try {
    await createOrder(
      t,
      { ...base(x), rentalEnd: future(9) },
      [item(x.serialized.v.id)],
      {},
    );
  } catch {
    invalid = true;
  }
  mark("J", invalid);
  await reserveOrder(t, a.id, {});
  mark("K", (await getOrder(t, a.id))?.capacityAllocations.length === 1);
  const bulk = await createOrder(
    t,
    base(x, future(20), future(22)),
    [item(x.bulk.v.id, 2)],
    {},
  );
  await reserveOrder(t, bulk.id, {});
  mark(
    "L",
    (await getOrder(t, bulk.id))?.capacityAllocations[0].quantity === 2,
  );
  const too = await createOrder(
    t,
    base(x, future(20), future(22)),
    [item(x.bulk.v.id, 2)],
    {},
  );
  let insufficient = false;
  try {
    await reserveOrder(t, too.id, {});
  } catch {
    insufficient = true;
  }
  mark("M", insufficient);
  const multi = await createOrder(
    t,
    base(x, future(30), future(32)),
    [item(x.serialized.v.id), item(x.bulk.v.id)],
    {},
  );
  await reserveOrder(t, multi.id, {});
  mark("N", (await getOrder(t, multi.id))?.capacityAllocations.length === 2);
  const fail = await createOrder(
    t,
    base(x, future(40), future(42)),
    [item(x.serialized.v.id), item(x.single.v.id, 2)],
    {},
  );
  let failed = false;
  try {
    await reserveOrder(t, fail.id, {});
  } catch {
    failed = true;
  }
  mark(
    "O",
    failed &&
      (await db.capacityAllocation.count({ where: { orderId: fail.id } })) ===
        0,
  );
  const overlap = await createOrder(
    t,
    base(x, future(20), future(22)),
    [item(x.bulk.v.id, 2)],
    {},
  );
  let ov = false;
  try {
    await reserveOrder(t, overlap.id, {});
  } catch {
    ov = true;
  }
  mark("P", ov);
  const non = await createOrder(
    t,
    base(x, future(23), future(24)),
    [item(x.bulk.v.id, 2)],
    {},
  );
  await reserveOrder(t, non.id, {});
  mark("Q");
  const b1 = await createOrder(
    t,
    base(x, future(50), future(51)),
    [item(x.buffered.v.id)],
    {},
  );
  await reserveOrder(t, b1.id, {});
  const b2 = await createOrder(
    t,
    base(x, new Date(future(51).getTime() + 30 * 60000), future(52)),
    [item(x.buffered.v.id)],
    {},
  );
  let buf = false;
  try {
    await reserveOrder(t, b2.id, {});
  } catch {
    buf = true;
  }
  mark("R", buf);
  await updateOrder(
    t,
    a.id,
    { ...base(x, future(60), future(62)), discountMinor: BigInt(0) },
    {},
  );
  mark(
    "S",
    (await getOrder(t, a.id))?.rentalStartAt?.getTime() ===
      future(60).setMilliseconds(0),
  );
  const dateBlocker = await createOrder(
    t,
    base(x, future(20), future(22)),
    [item(x.serialized.v.id, 2)],
    {},
  );
  await reserveOrder(t, dateBlocker.id, {});
  const old = (await getOrder(t, a.id))!.rentalStartAt!.getTime();
  let preserve = false;
  try {
    await updateOrder(
      t,
      a.id,
      { ...base(x, future(20), future(22)), discountMinor: BigInt(0) },
      {},
    );
  } catch {
    preserve = true;
  }
  mark(
    "T",
    preserve && (await getOrder(t, a.id))!.rentalStartAt!.getTime() === old,
  );
  const ai = (await getOrder(t, a.id))!.items[0];
  await updateOrderItem(t, a.id, ai.id, item(x.serialized.v.id, 2), {});
  mark("U", (await getOrder(t, a.id))!.items[0].quantity === 2);
  let qp = false;
  try {
    await updateOrderItem(t, a.id, ai.id, item(x.serialized.v.id, 3), {});
  } catch {
    qp = true;
  }
  mark("V", qp && (await getOrder(t, a.id))!.items[0].quantity === 2);
  await addOrderItem(t, a.id, item(x.bulk.v.id), {});
  mark("W", (await getOrder(t, a.id))!.items.length === 2);
  let ap = false;
  try {
    await addOrderItem(t, a.id, item(x.single.v.id, 2), {});
  } catch {
    ap = true;
  }
  mark("X", ap && (await getOrder(t, a.id))!.items.length === 2);
  const rm = (await getOrder(t, a.id))!.items.find(
    (i) => i.productVariantId === x.bulk.v.id,
  )!;
  await removeOrderItem(t, a.id, rm.id, {});
  mark("Y", (await getOrder(t, a.id))!.items.length === 1);
  await confirmOrder(t, a.id, {});
  mark("Z", (await getOrder(t, a.id))?.status === "CONFIRMED");
  let transition = false;
  try {
    await confirmOrder(t, a.id, {});
  } catch {
    transition = true;
  }
  mark("AA", transition);
  await cancelOrder(t, a.id, "Клиент отменил", {});
  detail = await getOrder(t, a.id);
  mark("AB", detail?.status === "CANCELLED");
  mark("AC", detail?.capacityAllocations.length === 0);
  mark("AD", detail?.items.length === 1);
  mark("AE", (detail?.events.length ?? 0) >= 6);
  mark(
    "AF",
    (await getCustomerOrders(t, x.customer.id)).some((o) => o.id === a.id),
  );
  mark("AG", (await getOrders(t, { search: a.orderNumber })).length === 1);
  mark("AH", (await getOrders(t, { search: "Alice" })).length > 0);
  mark("AI", (await getOrders(t, { search: "+77000000000" })).length > 0);
  mark(
    "AJ",
    (await getOrders(t, { status: "CANCELLED" })).some((o) => o.id === a.id),
  );
  mark("AK", (await getOrders(t, { branchId: x.branch.id })).length > 0);
  mark("AL", (await getOrders(t, { source: "CRM" })).length > 0);
  mark(
    "AM",
    (await getOrders(t, { from: future(59), until: future(63) })).some(
      (o) => o.id === a.id,
    ),
  );
  mark("AN", (await getOrder(other, a.id)) === null);
  let cross = false;
  try {
    await updateOrder(other, a.id, base(y), {});
  } catch {
    cross = true;
  }
  mark("AO", cross);
  let cc = false;
  try {
    await createOrder(
      t,
      { ...base(x), customerId: y.customer.id },
      [item(x.serialized.v.id)],
      {},
    );
  } catch {
    cc = true;
  }
  mark("AP", cc);
  let cb = false;
  try {
    await createOrder(
      t,
      { ...base(x), branchId: y.branch.id },
      [item(x.serialized.v.id)],
      {},
    );
  } catch {
    cb = true;
  }
  mark("AQ", cb);
  let cv = false;
  try {
    await createOrder(t, base(x), [item(y.serialized.v.id)], {});
  } catch {
    cv = true;
  }
  mark("AR", cv);
  mark("AS", canPerformOrderAction("OWNER", "CANCEL_ORDERS"));
  mark("AT", canPerformOrderAction("DIRECTOR", "CANCEL_ORDERS"));
  mark(
    "AU",
    canPerformOrderAction("SELLER", "CONFIRM_ORDERS") &&
      !canPerformOrderAction("SELLER", "CANCEL_ORDERS"),
  );
  mark(
    "AV",
    canPerformOrderAction("CASHIER", "READ_ORDERS") &&
      !canPerformOrderAction("CASHIER", "CREATE_ORDERS"),
  );
  mark("AW", detail?.items[0].capacityAllocations !== undefined);
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  mark("AX", !schema.includes("customerBalance"));
  mark(
    "AY",
    !schema.includes("model Payment") &&
      !schema.includes("model DepositTransaction"),
  );
  mark(
    "AZ",
    !schema.includes("ITEM_ISSUED") && !schema.includes("ITEM_RETURNED"),
  );
  const c1 = await createOrder(
      t,
      base(x, future(70), future(71)),
      [item(x.single.v.id)],
      {},
    ),
    c2 = await createOrder(
      t,
      base(x, future(70), future(71)),
      [item(x.single.v.id)],
      {},
    ),
    results = await Promise.allSettled([
      reserveOrder(t, c1.id, {}),
      reserveOrder(t, c2.id, {}),
    ]);
  mark(
    "CONCURRENCY",
    results.filter((r) => r.status === "fulfilled").length === 1,
  );
  console.log([...ok].map(([k]) => `PASS ${k}`).join("\n"));
}
run()
  .then(cleanup)
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : "Integration failed");
    await cleanup();
    await db.$disconnect();
    process.exit(1);
  });
