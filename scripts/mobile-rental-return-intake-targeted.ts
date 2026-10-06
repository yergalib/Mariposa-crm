import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

async function main(){
  const paths=["components/RentalOperationalPanel.tsx","app/returns/page.tsx","app/returns/[orderId]/page.tsx","components/RentalReturnIntake.tsx","lib/fulfillment/return-intake.ts","app/orders/actions.ts","lib/fulfillment/returns.ts","lib/fulfillment/bulk-returns.ts","components/OperationalItemSelector.tsx","app/orders.css"];
  const files=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await readFile(path,"utf8")]))) as Record<string,string>,pass:string[]=[];
  const ok=(value:unknown,name:string)=>{assert.ok(value,name);pass.push(name)};
  const [panel,returns,route,intake,reader,actions,serialized,bulk,selector,css]=paths.map(path=>files[path]);
  ok(panel.includes('href={`/returns/${orderId}`}')&&!panel.includes('href="/returns" className="ui-button primary">Принять возврат'),"known order opens direct return intake");
  ok(returns.includes('/returns/${row.orderId}?allocation=')&&returns.includes("Продолжить возврат"),"unknown BULK discovery opens same intake");
  ok(returns.includes('/returns/${rental.order.id}?allocation=')&&returns.includes('&barcode='),"unknown SERIALIZED discovery opens same intake");
  ok(!returns.includes("action={receiveReturnAction}"),"discovery screen is read only");
  ok(route.includes('requirePermission(session, "RETURN_PROCESS")')&&route.includes("requireBranchAccess")&&route.includes("getRentalReturnIntake"),"intake route reauthorizes permission tenant and branch");
  ok(reader.includes('organizationId: tenant.organizationId')&&reader.includes('type: "RENTAL"')&&reader.includes('issuedAt: { not: null }')&&reader.includes("outstandingQuantity"),"server derives issued outstanding return context");
  ok(intake.includes("items.length > 1")&&intake.includes("setSelectedId")&&intake.includes("outstandingQuantity"),"multiple issued items can be selected");
  ok(intake.includes('max={selected.outstandingQuantity}')&&bulk.includes("totalQuantity > outstanding"),"BULK quantity is bounded in UI and domain");
  ok(intake.includes('selected.trackingMode === "BULK"')&&intake.includes("returnBulkIntakeAction"),"known BULK return needs no scan");
  ok(intake.includes('selected.trackingMode === "SERIALIZED"')&&intake.includes('purpose="RETURN_RECEIVE"')&&intake.includes("result.instance.id !== selected.instance?.id"),"SERIALIZED return requires exact instance verification");
  ok(actions.includes("returnBulkIntakeAction")&&actions.includes("recordBulkReturn")&&actions.includes("receiveReturnForOrderAction")&&actions.includes("receiveReturnByBarcode"),"intake actions reuse canonical return services");
  ok(actions.includes('orderId:id,sourceType:"ORDER",productInstanceId:null')&&actions.includes("orderItemId:allocation.orderItemId"),"BULK client cannot choose order item or tenant topology");
  ok(serialized.includes("expectedOrderId?: string")&&serialized.includes("orderId: expectedOrderId"),"SERIALIZED command is constrained to expected order");
  ok(bulk.includes('"GOOD" | "NEEDS_CLEANING" | "DAMAGED"')&&bulk.includes("returnBulkDispositionInventory")&&bulk.includes('sourceType: "MAINTENANCE"'),"GOOD cleaning and damage retain canonical physical workflows");
  ok(bulk.includes("returnBulkInventory")||bulk.includes("returnBulkDispositionInventory"),"GOOD return retains canonical inventory ledger mutation");
  ok(selector.includes('/returns/${returnMatch.orderId}')&&selector.includes('/returns/${order.orderId}?allocation='),"shared selector converges directly on intake");
  ok(!selector.includes('const primaryHref=returnOrderId?`/orders/${returnOrderId}`'),"previous return loop removed");
  ok(css.includes("shared order-aware return intake")&&css.includes("@media(max-width:760px)")&&css.includes("font-size:16px")&&css.includes("min-height:44px"),"mobile return form has iPhone-safe controls");
  console.log(`FOUNDATION-1F shared return intake targeted: ${pass.length}/${pass.length} passed`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
