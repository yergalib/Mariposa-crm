import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

async function main(){
  const paths=["app/returns/page.tsx","components/InventoryView.tsx","components/OperationalItemSelector.tsx","app/scan-actions.ts","lib/inventory/operational-context.ts","lib/inventory/operational-identifier.ts","lib/fulfillment/returns.ts","app/orders/actions.ts","app/scanner.css"];
  const files=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await readFile(path,"utf8")])) ) as Record<string,string>,pass:string[]=[];
  const ok=(value:unknown,name:string)=>{assert.ok(value,name);pass.push(name)};
  const returns=files[paths[0]],warehouse=files[paths[1]],selector=files[paths[2]],actions=files[paths[3]],context=files[paths[4]],resolver=files[paths[5]],returnDomain=files[paths[6]],orderActions=files[paths[7]],css=files[paths[8]];
  ok(returns.includes("OperationalItemSelector")&&returns.includes('purpose="RETURN_RECEIVE"'),"returns reuses shared selector");
  ok(warehouse.includes("OperationalItemSelector")&&warehouse.includes('purpose="WAREHOUSE_LOOKUP"'),"warehouse reuses shared selector");
  ok(!Object.values(files).some(source=>source.includes("ReturnScanner")||source.includes("WarehouseScanner")),"no duplicate scanner implementation");
  ok(selector.includes("resolveOperationalContextAction")&&selector.includes("purpose"),"selector delegates contextual resolution");
  ok(resolver.includes('RETURN_RECEIVE: ["RETURN_PROCESS"]')&&resolver.includes('WAREHOUSE_LOOKUP: ["INVENTORY_VIEW"]'),"purpose permissions remain explicit");
  ok(actions.includes('purpose==="RETURN_RECEIVE"')&&actions.includes('requirePermission(session,"RETURN_PROCESS")')&&actions.includes('purpose==="WAREHOUSE_LOOKUP"')&&actions.includes('requirePermission(session,"INVENTORY_VIEW")'),"manual search follows purpose permission");
  ok(context.includes("getOutstandingBulkRentalsForVariant")&&context.includes('kind:"RETURN_BULK"'),"bulk return context uses issued allocations");
  ok(context.includes("lookupCurrentRentalByBarcode")&&context.includes('kind:"RETURN_SERIALIZED"'),"serialized return context uses existing rental lookup");
  ok(context.includes('kind:"RETURN_NOT_ELIGIBLE"'),"non-returnable state controlled");
  ok(selector.includes('context.orders.length>1?"Выберите заказ"'),"bulk ambiguity requires explicit order selection");
  ok(context.includes("accessibleBranchIds")&&context.includes("organizationId:tenant.organizationId"),"warehouse context tenant and branch scoped");
  ok(context.includes('kind:"WAREHOUSE_BULK"')&&context.includes('kind:"WAREHOUSE_SERIALIZED"'),"warehouse DTO covers bulk and serialized");
  ok(context.includes("branchName")&&context.includes("locationName")&&context.includes("conditionStatus"),"warehouse safe location and condition fields");
  ok(!context.match(/purchaseCost|margin|financial/i),"context excludes finance internals");
  ok(!context.match(/\.create\(|\.update\(|\.delete\(|inventoryMovement\.create/),"context resolution performs no mutation");
  ok(orderActions.includes("receiveReturnByBarcode")&&returnDomain.includes("db.$transaction")&&returnDomain.includes("requireMember")&&returnDomain.includes("requireActorBranch"),"final return retains domain reauthorization and transaction");
  ok(selector.includes("✓ Товар найден")&&selector.includes("Сканировать ещё")&&selector.includes("lastSubmitRef.current"),"accepted success and scan-again UX retained");
  ok(selector.includes('import("@/lib/scanning/zxing-camera-adapter")'),"same lazy camera adapter retained");
  ok(selector.includes("Введите или отсканируйте код")&&selector.includes("searchOperationalItemsAction"),"manual fallback retained");
  ok(css.includes("operational-scan-entry")&&css.includes("max-width:760px"),"mobile operational entry is responsive");
  ok(returns.includes("receiveReturnAction"),"existing return command remains final mutation");
  console.log(`MOBILE/SCANNING FOUNDATION-1C targeted: ${pass.length}/${pass.length} passed`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
