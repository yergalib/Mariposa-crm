import "dotenv/config";
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function main() {
  const require = createRequire(import.meta.url), serverOnly = require.resolve("server-only");
  require.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {}, children: [], paths: [] } as unknown as NodeJS.Module;
  const [{ RentalReturnIntake }, { db }, { getRentalReturnIntake }, { createTenantContext }] = await Promise.all([
    import("../components/RentalReturnIntake"), import("../lib/db"), import("../lib/fulfillment/return-intake"), import("../lib/tenant/context"),
  ]);
  const orderId = "37398f24-5c1e-42ba-acf4-758f6129491b";
  const query = {
    organizationId: true,
    items: {
      where: { removedAt: null },
      select: {
        id: true, quantity: true,
        productVariant: { select: { id: true, sku: true, product: { select: { name: true, trackingMode: true } }, execution: { select: { name: true } }, size: { select: { name: true, code: true } } } },
        capacityAllocations: { where: { sourceType: "ORDER" as const, issuedAt: { not: null } }, select: { id: true, branchId: true, issuedQuantity: true, returnedQuantity: true, returnedAt: true, productInstanceId: true, productInstance: { select: { inventoryNumber: true, barcode: true, operationalStatus: true } } } },
      },
    },
  };
  const snapshot = await db.order.findUnique({ where: { id: orderId }, select: query });
  assert.ok(snapshot, "R-000003 exists");
  const controlsBefore = JSON.stringify(snapshot);
  const context = await getRentalReturnIntake(createTenantContext(snapshot.organizationId), orderId);
  assert.equal(context.order.orderNumber, "R-000003");

  const terminalMarkup = renderToStaticMarkup(createElement(RentalReturnIntake, { order: context.order, items: [], locations: context.locations, operationKey: "readonly-returned-render-check" }));
  assert.ok(terminalMarkup.includes("Все выданные позиции уже обработаны") && terminalMarkup.includes("Невозвращённых товаров по этому заказу нет."), "RETURNED composition renders a stable terminal state");

  const item = snapshot.items[0], allocation = item?.capacityAllocations[0];
  assert.ok(item && allocation, "issued allocation history remains available");
  const syntheticIssuedItem = {
    orderItemId: item.id, allocationId: allocation.id, branchId: allocation.branchId,
    productVariantId: item.productVariant.id, productName: item.productVariant.product.name,
    executionName: item.productVariant.execution?.name ?? null,
    sizeName: item.productVariant.size.name || item.productVariant.size.code,
    sku: item.productVariant.sku, trackingMode: item.productVariant.product.trackingMode,
    orderedQuantity: item.quantity, issuedQuantity: allocation.issuedQuantity,
    returnedQuantity: 0, outstandingQuantity: Math.max(allocation.issuedQuantity, 1),
    instance: allocation.productInstance ? { id: allocation.productInstanceId!, ...allocation.productInstance } : null,
  };
  const issuedMarkup = renderToStaticMarkup(createElement(RentalReturnIntake, { order: context.order, items: [syntheticIssuedItem], locations: context.locations, operationKey: "readonly-issued-render-check" }));
  for (const expected of [context.order.orderNumber, syntheticIssuedItem.productName, "К возврату:", "Хорошее состояние", "Требуется чистка", "Повреждено", "Принять возврат"]) assert.ok(issuedMarkup.includes(expected), `ISSUED render includes ${expected}`);
  if (syntheticIssuedItem.trackingMode === "BULK") assert.ok(!issuedMarkup.includes("Сканировать товар"), "known BULK order does not require discovery scan");

  const controlsAfter = JSON.stringify(await db.order.findUnique({ where: { id: orderId }, select: query }));
  assert.equal(controlsAfter, controlsBefore, "page composition is read-only");
  console.log("RENTAL RETURN PAGE read-only composition: ISSUED and RETURNED passed", { currentOutstandingItems: context.items.length });
  await db.$disconnect();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
