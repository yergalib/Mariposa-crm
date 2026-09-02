import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { createTenantContext } from "../lib/tenant/context";
import { createCustomer, updateCustomer } from "../lib/customers/management";
import {
  createOrder,
  reserveOrder,
  updateOrder,
  updateOrderItem,
  addOrderItem,
  removeOrderItem,
  confirmOrder,
  cancelOrder,
} from "../lib/orders/management";
import { getOrder } from "../lib/orders/queries";
import {
  getVariantAvailability,
  assignInstanceToAllocation,
} from "../lib/availability/capacity";
import { getCalendar } from "../lib/calendar/queries";
import { zonedDateTimeToUtc } from "../lib/calendar/timezone";
import { replaceCurrentPrice } from "../lib/catalog/management";
import { requireOrderPermission } from "../lib/orders/permissions";

const organizations: string[] = [];
const results: string[] = [];
function pass(name: string, value: unknown) {
  if (!value) throw Error(`FAIL ${name}`);
  results.push(name);
}
const local = (day: number, hour: number, minute = 0) =>
  zonedDateTimeToUtc(
    { year: 2026, month: 9, day },
    "Asia/Almaty",
    hour,
    minute,
  );
async function cleanup() {
  for (const organizationId of organizations)
    await db
      .$transaction(async (tx) => {
        await tx.authSession.deleteMany({ where: { organizationId } });
        await tx.capacityAllocation.deleteMany({ where: { organizationId } });
        await tx.orderEvent.deleteMany({ where: { organizationId } });
        await tx.orderItem.deleteMany({ where: { organizationId } });
        await tx.order.deleteMany({ where: { organizationId } });
        await tx.orderCounter.deleteMany({ where: { organizationId } });
        await tx.customerImportBatch.deleteMany({ where: { organizationId } });
        await tx.customerNote.deleteMany({ where: { organizationId } });
        await tx.customerAddress.deleteMany({ where: { organizationId } });
        await tx.customerContact.deleteMany({ where: { organizationId } });
        await tx.customer.deleteMany({ where: { organizationId } });
        await tx.customerCounter.deleteMany({ where: { organizationId } });
        await tx.productImage.deleteMany({ where: { organizationId } });
        await tx.productPrice.deleteMany({ where: { organizationId } });
        await tx.stockAdjustment.deleteMany({ where: { organizationId } });
        await tx.stockLevel.deleteMany({ where: { organizationId } });
        await tx.instanceStatusHistory.deleteMany({ where: { organizationId } });
        await tx.instanceConditionHistory.deleteMany({ where: { organizationId } });
        await tx.productInstance.deleteMany({ where: { organizationId } });
        await tx.inventoryCounter.deleteMany({ where: { organizationId } });
        await tx.productVariant.deleteMany({ where: { organizationId } });
        await tx.product.deleteMany({ where: { organizationId } });
        await tx.size.deleteMany({ where: { organizationId } });
        await tx.category.deleteMany({ where: { organizationId } });
        await tx.location.deleteMany({ where: { organizationId } });
        await tx.organizationMembership.deleteMany({
          where: { organizationId },
        });
        await tx.branch.deleteMany({ where: { organizationId } });
        await tx.organizationSettings.deleteMany({ where: { organizationId } });
        await tx.organization.delete({ where: { id: organizationId } });
      }, { maxWait: 10_000, timeout: 30_000 })
      .catch((error) => console.error("Stage 6C cleanup failed", error instanceof Error ? error.message : "error"));
}
async function setup(label: string) {
  const id = randomUUID();
  organizations.push(id);
  const organization = await db.organization.create({
      data: {
        id,
        name: `Stage 6C ${label}`,
        slug: `stage-6c-${label}-${id.slice(0, 8)}`,
        timezone: "Asia/Almaty",
        settings: { create: { turnaroundBufferMinutes: 120 } },
      },
    }),
    branchA = await db.branch.create({
      data: {
        organizationId: id,
        name: "Branch A",
        code: "A",
        city: "Test",
        timezone: "Asia/Almaty",
      },
    }),
    branchB = await db.branch.create({
      data: {
        organizationId: id,
        name: "Branch B",
        code: "B",
        city: "Test",
        timezone: "Asia/Almaty",
      },
    }),
    locationA = await db.location.create({
      data: {
        organizationId: id,
        branchId: branchA.id,
        name: "A showroom",
        code: "LA",
        type: "SHOWROOM",
      },
    }),
    locationB = await db.location.create({
      data: {
        organizationId: id,
        branchId: branchB.id,
        name: "B showroom",
        code: "LB",
        type: "SHOWROOM",
      },
    }),
    category = await db.category.create({
      data: { organizationId: id, name: "Rental", slug: "rental" },
    }),
    size120 = await db.size.create({
      data: { organizationId: id, code: "120", name: "120" },
    }),
    size130 = await db.size.create({
      data: { organizationId: id, code: "130", name: "130" },
    });
  async function product(
    name: string,
    code: string,
    mode: "SERIALIZED" | "BULK",
    sizes: Array<{
      sizeId: string;
      sku: string;
      a: number;
      b?: number;
      price: number;
    }>,
  ) {
    const p = await db.product.create({
        data: {
          organizationId: id,
          categoryId: category.id,
          name,
          internalCode: code,
          trackingMode: mode,
          publicationStatus: "ACTIVE",
        },
      }),
      variants = [];
    for (const s of sizes) {
      const v = await db.productVariant.create({
        data: {
          organizationId: id,
          productId: p.id,
          sizeId: s.sizeId,
          sku: s.sku,
        },
      });
      await db.productPrice.create({
        data: {
          organizationId: id,
          productVariantId: v.id,
          type: "RENTAL",
          amountMinor: s.price,
          currency: "KZT",
          validFrom: new Date(0),
        },
      });
      if (mode === "SERIALIZED") {
        for (let i = 0; i < s.a; i++)
          await db.productInstance.create({
            data: {
              organizationId: id,
              productVariantId: v.id,
              inventoryNumber: `${code}-${s.sku}-A${i}`,
              barcode: `${code}${s.sku}A${i}`,
              homeBranchId: branchA.id,
              currentBranchId: branchA.id,
              currentLocationId: locationA.id,
            },
          });
        for (let i = 0; i < (s.b ?? 0); i++)
          await db.productInstance.create({
            data: {
              organizationId: id,
              productVariantId: v.id,
              inventoryNumber: `${code}-${s.sku}-B${i}`,
              barcode: `${code}${s.sku}B${i}`,
              homeBranchId: branchB.id,
              currentBranchId: branchB.id,
              currentLocationId: locationB.id,
            },
          });
      } else {
        await db.stockLevel.create({
          data: {
            organizationId: id,
            productVariantId: v.id,
            branchId: branchA.id,
            locationId: locationA.id,
            quantity: s.a,
          },
        });
        await db.stockLevel.create({
          data: {
            organizationId: id,
            productVariantId: v.id,
            branchId: branchB.id,
            locationId: locationB.id,
            quantity: s.b ?? 0,
          },
        });
      }
      variants.push(v);
    }
    return { p, variants };
  }
  const snow = await product("Белоснежка", "SNOW", "SERIALIZED", [
      { sizeId: size120.id, sku: "SNOW-120", a: 3, price: 1200 },
      { sizeId: size130.id, sku: "SNOW-130", a: 2, price: 1300 },
    ]),
    aurora = await product("Аврора", "AUR", "SERIALIZED", [
      { sizeId: size120.id, sku: "AUR-120", a: 1, price: 1400 },
    ]),
    crown = await product("Корона", "CROWN", "BULK", [
      { sizeId: size120.id, sku: "CROWN-STD", a: 10, b: 5, price: 300 },
    ]);
  const tenant = createTenantContext(id),
    customerData = (name: string, phone: string) => ({
      customer: {
        firstName: name,
        lastName: "Test",
        middleName: null,
        birthDate: null,
        preferredLanguage: "ru",
        source: "CRM",
        status: "ACTIVE",
        marketingConsent: false,
      },
      contacts: [{ type: "PHONE" as const, value: phone, isPrimary: true }],
    });
  const customerA = await createCustomer(
      tenant,
      customerData("Customer A", "+77000000001"),
    ),
    customerB = await createCustomer(
      tenant,
      customerData("Customer B", "+77000000002"),
    ),
    customerC = await createCustomer(
      tenant,
      customerData("Customer C", "+77000000003"),
    );
  return {
    organization,
    tenant,
    branchA,
    branchB,
    locationA,
    locationB,
    snow120: snow.variants[0],
    snow130: snow.variants[1],
    snowProduct: snow.p,
    aurora120: aurora.variants[0],
    crown: crown.variants[0],
    customerA,
    customerB,
    customerC,
  };
}
const base = (
  f: Awaited<ReturnType<typeof setup>>,
  customerId: string,
  start: Date,
  end: Date,
  branchId = f.branchA.id,
) => ({
  branchId,
  customerId,
  source: "CRM",
  rentalStart: start,
  rentalEnd: end,
  discountMinor: BigInt(0),
  internalComment: null,
});
const item = (
  productVariantId: string,
  quantity = 1,
  unitPriceMinor?: bigint,
) => ({ productVariantId, quantity, unitPriceMinor, discountMinor: BigInt(0) });
async function run() {
  const f = await setup("A"),
    g = await setup("B"),
    period = { start: local(10, 10), end: local(12, 18) };
  const availability = (
    variantId: string,
    start = period.start,
    end = period.end,
    branchId = f.branchA.id,
  ) =>
    getVariantAvailability({
      tenant: f.tenant,
      branchId,
      productVariantId: variantId,
      requestedFrom: start,
      requestedUntil: end,
    });
  pass(
    "core availability before",
    (await availability(f.snow120.id)).availableCapacity === 3,
  );
  const a = await createOrder(
    f.tenant,
    base(f, f.customerA.id, period.start, period.end),
    [item(f.snow120.id)],
    {},
  );
  pass(
    "customer order and price snapshot",
    (await getOrder(f.tenant, a.id))?.items[0].unitPriceMinor === BigInt(1200),
  );
  await reserveOrder(f.tenant, a.id, {});
  let ad = await getOrder(f.tenant, a.id);
  pass(
    "core reserved unassigned",
    ad?.status === "RESERVED" &&
      ad.capacityAllocations.length === 1 &&
      ad.capacityAllocations[0].productInstanceId === null,
  );
  pass(
    "core availability after",
    (await availability(f.snow120.id)).availableCapacity === 2,
  );
  let cal = await getCalendar(
    f.tenant,
    { view: "week", date: "2026-09-10", statuses: ["RESERVED"] },
    local(10, 8),
  );
  pass(
    "core calendar start end span",
    cal.orders.some((x) => x.id === a.id) &&
      cal.days
        .find((x) => x.key === "2026-09-10")
        ?.starts.some((x) => x.id === a.id) &&
      cal.days
        .find((x) => x.key === "2026-09-12")
        ?.ends.some((x) => x.id === a.id),
  );
  const b = await createOrder(
    f.tenant,
    base(f, f.customerB.id, period.start, period.end),
    [item(f.snow120.id, 2)],
    {},
  );
  await reserveOrder(f.tenant, b.id, {});
  pass(
    "identical dresses capacity zero",
    (await availability(f.snow120.id)).availableCapacity === 0,
  );
  const c = await createOrder(
    f.tenant,
    base(f, f.customerC.id, period.start, period.end),
    [item(f.snow120.id)],
    {},
  );
  let rejected = false;
  try {
    await reserveOrder(f.tenant, c.id, {});
  } catch {
    rejected = true;
  }
  pass(
    "overbooking rejected atomic",
    rejected &&
      (await db.capacityAllocation.count({ where: { orderId: c.id } })) === 0 &&
      (await getOrder(f.tenant, c.id))?.status === "DRAFT" &&
      (await availability(f.snow120.id)).availableCapacity === 0,
  );
  pass(
    "buffer blocks",
    !(await availability(f.snow120.id, local(12, 19), local(12, 21)))
      .canFulfill,
  );
  pass(
    "buffer half-open releases",
    (await availability(f.snow120.id, local(12, 20), local(13, 10)))
      .availableCapacity === 3,
  );
  const size = await createOrder(
    f.tenant,
    base(f, f.customerA.id, period.start, period.end),
    [item(f.snow130.id)],
    {},
  );
  await reserveOrder(f.tenant, size.id, {});
  const aur = await createOrder(
    f.tenant,
    base(f, f.customerA.id, period.start, period.end),
    [item(f.aurora120.id)],
    {},
  );
  await reserveOrder(f.tenant, aur.id, {});
  pass(
    "different size independent",
    (await availability(f.snow130.id)).availableCapacity === 1,
  );
  pass(
    "different product independent",
    (await availability(f.aurora120.id)).availableCapacity === 0,
  );
  const mixedStart = local(13, 10),
    mixedEnd = local(14, 10),
    mixed = await createOrder(
      f.tenant,
      base(f, f.customerA.id, mixedStart, mixedEnd),
      [item(f.snow120.id), item(f.crown.id, 3)],
      {},
    );
  await reserveOrder(f.tenant, mixed.id, {});
  pass(
    "serialized bulk one transaction",
    (await getOrder(f.tenant, mixed.id))?.capacityAllocations.length === 2,
  );
  for (const [name, items] of [
    ["bulk rollback", [item(f.snow120.id), item(f.crown.id, 11)]],
    ["serialized rollback", [item(f.snow120.id, 4), item(f.crown.id)]],
  ] as const) {
    const o = await createOrder(
      f.tenant,
      base(f, f.customerB.id, local(15, 10), local(16, 10)),
      [...items],
      {},
    );
    let fail = false;
    try {
      await reserveOrder(f.tenant, o.id, {});
    } catch {
      fail = true;
    }
    pass(
      name,
      fail &&
        (await db.capacityAllocation.count({ where: { orderId: o.id } })) === 0,
    );
  }
  pass(
    "branch bulk isolation",
    (await availability(f.crown.id, mixedStart, mixedEnd, f.branchB.id))
      .availableCapacity === 5,
  );
  pass(
    "branch serialized eligibility",
    (await availability(f.snow120.id, mixedStart, mixedEnd, f.branchB.id))
      .totalCapacity === 0,
  );
  const oldAlloc = (await getOrder(f.tenant, size.id))!.capacityAllocations[0]
    .id;
  await updateOrder(
    f.tenant,
    size.id,
    base(f, f.customerA.id, local(15, 10), local(16, 10)),
    {},
  );
  let moved = await getOrder(f.tenant, size.id);
  pass(
    "successful replacement",
    moved?.rentalStartAt?.getTime() === local(15, 10).getTime() &&
      !moved.capacityAllocations.some((x) => x.id === oldAlloc) &&
      (await db.capacityAllocation.findUnique({ where: { id: oldAlloc } }))
        ?.status === "RELEASED",
  );
  const blocker = await createOrder(
    f.tenant,
    base(f, f.customerB.id, local(17, 10), local(18, 10)),
    [item(f.snow130.id, 2)],
    {},
  );
  await reserveOrder(f.tenant, blocker.id, {});
  const preservedStart = moved!.rentalStartAt!.getTime(),
    preservedAllocation = moved!.capacityAllocations[0].id;
  let moveFail = false;
  try {
    await updateOrder(
      f.tenant,
      size.id,
      base(f, f.customerA.id, local(17, 10), local(18, 10)),
      {},
    );
  } catch {
    moveFail = true;
  }
  moved = await getOrder(f.tenant, size.id);
  pass(
    "failed replacement rollback",
    moveFail &&
      moved?.rentalStartAt?.getTime() === preservedStart &&
      moved.capacityAllocations[0].id === preservedAllocation,
  );
  await updateOrderItem(
    f.tenant,
    size.id,
    moved!.items[0].id,
    item(f.snow130.id, 2, BigInt(1300)),
    {},
  );
  pass(
    "quantity increase",
    (await getOrder(f.tenant, size.id))?.items[0].quantity === 2,
  );
  let quantityFail = false;
  try {
    await updateOrderItem(
      f.tenant,
      size.id,
      moved!.items[0].id,
      item(f.snow130.id, 3, BigInt(1300)),
      {},
    );
  } catch {
    quantityFail = true;
  }
  pass(
    "quantity rollback",
    quantityFail &&
      (await getOrder(f.tenant, size.id))?.items[0].quantity === 2,
  );
  const added = await addOrderItem(f.tenant, size.id, item(f.crown.id, 2), {});
  pass(
    "add item allocation total",
    (await getOrder(f.tenant, size.id))?.capacityAllocations.length === 2,
  );
  await removeOrderItem(f.tenant, size.id, added.id, {});
  const removed = await db.orderItem.findUnique({ where: { id: added.id } }),
    afterRemove = await getOrder(f.tenant, size.id);
  pass(
    "remove item soft history",
    removed?.removedAt !== null &&
      removed?.status === "CANCELLED" &&
      !afterRemove?.items.some((x) => x.id === added.id) &&
      !afterRemove?.capacityAllocations.some((x) => x.orderItemId === added.id),
  );
  const priceOrder = await createOrder(
    f.tenant,
    base(f, f.customerA.id, local(21, 10), local(22, 10)),
    [item(f.snow130.id)],
    {},
  );
  await replaceCurrentPrice(f.tenant, {
    variantId: f.snow130.id,
    branchId: null,
    type: "RENTAL",
    amountMinor: BigInt(1700),
    currency: "KZT",
  });
  const newPriceOrder = await createOrder(
    f.tenant,
    base(f, f.customerB.id, local(23, 10), local(24, 10)),
    [item(f.snow130.id)],
    {},
  );
  await db.product.update({
    where: { id: f.snowProduct.id },
    data: { name: "Белоснежка NEW" },
  });
  const renamedOrder = await createOrder(
    f.tenant,
    base(f, f.customerC.id, local(25, 10), local(26, 10)),
    [item(f.snow130.id)],
    {},
  );
  pass(
    "price snapshots",
    (await getOrder(f.tenant, priceOrder.id))?.items[0].unitPriceMinor ===
      BigInt(1300) &&
      (await getOrder(f.tenant, newPriceOrder.id))?.items[0].unitPriceMinor ===
        BigInt(1700),
  );
  pass(
    "product snapshots",
    (await getOrder(f.tenant, priceOrder.id))?.items[0].productNameSnapshot ===
      "Белоснежка" &&
      (await getOrder(f.tenant, renamedOrder.id))?.items[0]
        .productNameSnapshot === "Белоснежка NEW",
  );
  await updateCustomer(f.tenant, f.customerA.id, {
    firstName: "Customer A Updated",
    lastName: "Test",
    middleName: null,
    birthDate: null,
    preferredLanguage: "ru",
    source: "CRM",
    status: "ACTIVE",
    marketingConsent: false,
  });
  await db.customerContact.updateMany({
    where: { customerId: f.customerA.id, type: "PHONE" },
    data: { value: "+77009999999", normalizedValue: "+77009999999" },
  });
  cal = await getCalendar(
    f.tenant,
    { view: "month", date: "2026-09-10", statuses: ["RESERVED", "DRAFT"] },
    local(10, 8),
  );
  pass(
    "customer current relation behavior",
    cal.orders.find((x) => x.id === a.id)?.customerName ===
      "Customer A Updated Test" &&
      cal.orders.find((x) => x.id === a.id)?.phone === "+77009999999",
  );
  await cancelOrder(f.tenant, a.id, "Клиент отменил", {});
  ad = await getOrder(f.tenant, a.id);
  const defaultCal = await getCalendar(
      f.tenant,
      {
        view: "week",
        date: "2026-09-10",
        statuses: ["RESERVED", "CONFIRMED", "COMPLETED"],
      },
      local(10, 8),
    ),
    cancelCal = await getCalendar(
      f.tenant,
      { view: "week", date: "2026-09-10", statuses: ["CANCELLED"] },
      local(10, 8),
    );
  pass(
    "cancel lifecycle",
    ad?.status === "CANCELLED" &&
      ad.cancellationReason === "Клиент отменил" &&
      ad.capacityAllocations.length === 0 &&
      !defaultCal.orders.some((x) => x.id === a.id) &&
      cancelCal.orders.some((x) => x.id === a.id) &&
      ad.events.some((x) => x.eventType === "ORDER_CANCELLED"),
  );
  const last1 = await createOrder(
      f.tenant,
      base(f, f.customerA.id, local(27, 10), local(28, 10)),
      [item(f.aurora120.id)],
      {},
    ),
    last2 = await createOrder(
      f.tenant,
      base(f, f.customerB.id, local(27, 10), local(28, 10)),
      [item(f.aurora120.id)],
      {},
    ),
    lastResults = await Promise.allSettled([
      reserveOrder(f.tenant, last1.id, {}),
      reserveOrder(f.tenant, last2.id, {}),
    ]);
  pass(
    "last dress concurrency",
    lastResults.filter((x) => x.status === "fulfilled").length === 1 &&
      (await availability(f.aurora120.id, local(27, 10), local(28, 10)))
        .availableCapacity === 0,
  );
  const multiA = await createOrder(
      f.tenant,
      base(f, f.customerA.id, local(29, 10), local(30, 10)),
      [item(f.snow120.id, 3), item(f.aurora120.id)],
      {},
    ),
    multiB = await createOrder(
      f.tenant,
      base(f, f.customerB.id, local(29, 10), local(30, 10)),
      [item(f.aurora120.id), item(f.snow120.id, 3)],
      {},
    ),
    multiResult = await Promise.allSettled([
      reserveOrder(f.tenant, multiA.id, {}),
      reserveOrder(f.tenant, multiB.id, {}),
    ]),
    multiCounts = await Promise.all([multiA.id, multiB.id].map(id => db.capacityAllocation.count({ where: { orderId: id, status: "ACTIVE" } })));
  pass(
    "multi item stable lock no partial",
    multiResult.filter((x) => x.status === "fulfilled").length === 1 &&
      multiCounts.sort((a,b)=>a-b).join(",") === "0,2",
  );
  const tz = await createOrder(
    f.tenant,
    base(f, f.customerA.id, local(10, 23, 30), local(11, 0, 30)),
    [item(f.crown.id)],
    {},
  );
  await reserveOrder(f.tenant, tz.id, {});
  const tzCal = await getCalendar(
    f.tenant,
    { view: "week", date: "2026-09-10", statuses: ["RESERVED"] },
    local(10, 8),
  );
  pass(
    "timezone service to calendar",
    tzCal.days
      .find((x) => x.key === "2026-09-10")
      ?.starts.some((x) => x.id === tz.id) &&
      tzCal.days
        .find((x) => x.key === "2026-09-11")
        ?.ends.some((x) => x.id === tz.id),
  );
  for (const [name, input] of [
    [
      "cross customer",
      {
        ...base(f, g.customerA.id, local(20, 10), local(21, 10)),
        branchId: f.branchA.id,
      },
    ],
    [
      "cross branch",
      {
        ...base(f, f.customerA.id, local(20, 10), local(21, 10)),
        branchId: g.branchA.id,
      },
    ],
  ] as const) {
    let fail = false;
    try {
      await createOrder(f.tenant, input, [item(f.snow120.id)], {});
    } catch {
      fail = true;
    }
    pass(name, fail);
  }
  let crossVariant = false;
  try {
    await createOrder(
      f.tenant,
      base(f, f.customerA.id, local(20, 10), local(21, 10)),
      [item(g.snow120.id)],
      {},
    );
  } catch {
    crossVariant = true;
  }
  pass("cross variant", crossVariant);
  pass(
    "cross calendar search",
    !(
      await getCalendar(
        f.tenant,
        {
          view: "month",
          date: "2026-09-10",
          statuses: ["RESERVED", "DRAFT"],
          search: "Stage 6C B",
        },
        local(10, 8),
      )
    ).orders.some((x) => x.branchId === g.branchA.id),
  );
  const allocation = (await getOrder(f.tenant, b.id))!.capacityAllocations[0],
    foreignInstance = await db.productInstance.findFirstOrThrow({
      where: { organizationId: g.organization.id },
    });
  let assignmentFail = false;
  try {
    await assignInstanceToAllocation({
      tenant: f.tenant,
      allocationId: allocation.id,
      productInstanceId: foreignInstance.id,
    });
  } catch {
    assignmentFail = true;
  }
  pass("cross tenant instance assignment", assignmentFail);
  for (const role of ["OWNER", "DIRECTOR", "SELLER"] as const) {
    requireOrderPermission(role, "CREATE_ORDERS");
    pass(`permission ${role} write`, true);
  }
  let cashier = false;
  try {
    requireOrderPermission("CASHIER", "CREATE_ORDERS");
  } catch {
    cashier = true;
  }
  pass("permission CASHIER read only", cashier);
  let sellerCancel = false;
  try {
    requireOrderPermission("SELLER", "CANCEL_ORDERS");
  } catch {
    sellerCancel = true;
  }
  pass("permission cancel roles", sellerCancel);
  const activeCancelled = await db.capacityAllocation.count({
      where: {
        organizationId: f.organization.id,
        status: "ACTIVE",
        order: { status: "CANCELLED" },
      },
    }),
    activeRemoved = await db.capacityAllocation.count({
      where: {
        organizationId: f.organization.id,
        status: "ACTIVE",
        orderItem: { removedAt: { not: null } },
      },
    }),
    orphans = await db.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT COUNT(*)::bigint AS count FROM capacity_allocations ca LEFT JOIN orders o ON o.id=ca.order_id LEFT JOIN order_items oi ON oi.id=ca.order_item_id WHERE ca.organization_id=${f.organization.id}::uuid AND ca.source_type='ORDER' AND (o.id IS NULL OR oi.id IS NULL)`,
    duplicates = await db.order.groupBy({
      by: ["orderNumber"],
      where: { organizationId: f.organization.id },
      having: { orderNumber: { _count: { gt: 1 } } },
    }),
    negative = await db.stockLevel.count({
      where: { organizationId: f.organization.id, quantity: { lt: 0 } },
    });
  pass(
    "integrity no orphan active invalid duplicate negative",
    activeCancelled === 0 &&
      activeRemoved === 0 &&
      orphans[0].count === BigInt(0) &&
      duplicates.length === 0 &&
      negative === 0,
  );
  const allOrders = await db.order.findMany({
    where: { organizationId: f.organization.id },
    include: {
      items: { where: { removedAt: null } },
      capacityAllocations: { where: { status: "ACTIVE" } },
    },
  });
  pass(
    "integrity totals",
    allOrders.every(
      (o) =>
        o.totalMinor ===
        o.items.reduce((s, i) => s + i.lineTotalMinor, BigInt(0)) -
          o.discountTotalMinor,
    ),
  );
  pass(
    "integrity allocation ownership",
    allOrders.every((o) =>
      o.capacityAllocations.every(
        (a) =>
          a.branchId === o.branchId &&
          a.orderId === o.id &&
          o.items.some(
            (i) =>
              i.id === a.orderItemId &&
              i.productVariantId === a.productVariantId,
          ),
      ),
    ),
  );
  const events = (await getOrder(f.tenant, size.id))!.events.slice().reverse();
  pass(
    "event history chronological tenant order metadata",
    events.every(
      (e, i) =>
        e.organizationId === f.organization.id &&
        e.orderId === size.id &&
        (i === 0 || e.createdAt >= events[i - 1].createdAt),
    ) &&
      events.some((e) => e.eventType === "RESERVATION_CREATED") &&
      events.some((e) => e.eventType === "ITEM_ADDED") &&
      events.some((e) => e.eventType === "ITEM_REMOVED"),
  );
  console.log(results.map((x) => `PASS ${x}`).join("\n"));
}
run()
  .then(cleanup)
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : "Stage 6C failed");
    await cleanup();
    await db.$disconnect();
    process.exit(1);
  });
