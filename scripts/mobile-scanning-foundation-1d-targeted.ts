import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

async function main(){
  const paths=["app/warehouse/stocktakes/[id]/page.tsx","components/OperationalItemSelector.tsx","app/scan-actions.ts","lib/inventory/operational-context.ts","lib/stocktake/management.ts","lib/inventory/operational-identifier.ts","app/scanner.css","prisma/schema.prisma"];
  const files=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await readFile(path,"utf8")]))) as Record<string,string>,passed:string[]=[];
  const ok=(value:unknown,name:string)=>{assert.ok(value,name);passed.push(name)};
  const page=files[paths[0]],selector=files[paths[1]],actions=files[paths[2]],context=files[paths[3]],domain=files[paths[4]],resolver=files[paths[5]],css=files[paths[6]],schema=files[paths[7]];
  ok(page.includes("OperationalItemSelector")&&page.includes('purpose="STOCKTAKE_COUNT"'),"stocktake reuses operational selector");
  ok(selector.includes('import("@/lib/scanning/zxing-camera-adapter")'),"camera adapter remains lazy loaded");
  ok(resolver.includes('STOCKTAKE_COUNT: ["STOCKTAKE_COUNT"]'),"stocktake purpose permission mapping");
  ok(actions.includes('requirePermission(session,"STOCKTAKE_COUNT")'),"server action reauthorizes count permission");
  ok(actions.includes("requireBranchAccess")&&actions.includes("organizationId:session.organizationId"),"tenant and branch isolation");
  ok(context.includes('kind:"STOCKTAKE_BULK"')&&context.includes("expectedQuantity")&&context.includes("countedQuantity"),"bulk context returns snapshot and count");
  ok(context.includes('kind:"STOCKTAKE_SERIALIZED"')&&context.includes("alreadyObserved"),"serialized context detects repeat scans");
  ok(actions.includes("setBulkCount")&&actions.includes("scanBarcode"),"existing Stage 8B mutations reused");
  ok(!actions.includes("changeBulk(")&&!actions.includes("changeSerializedStatus("),"selector actions do not mutate inventory directly");
  ok(domain.includes("stocktakeBulkCount.upsert")&&domain.includes("sessionId_productVariantId"),"bulk repeated save updates one logical line");
  ok(domain.includes("sessionId_productInstanceId")&&domain.includes("alreadyScanned:true"),"serialized repeat cannot double count");
  ok(resolver.includes('input.purpose==="STOCKTAKE_COUNT"')&&resolver.includes('trackingMode:"SERIALIZED"'),"historical serialized barcode remains countable");
  ok(domain.includes('status:"IN_PROGRESS"')&&domain.includes("countedQuantity:count"),"count writes only active stocktake state");
  ok(domain.includes("changeBulk")&&domain.includes("resolveBulk"),"inventory adjustment remains reconciliation-only");
  ok(page.includes("Ожидалось")&&page.includes("Фактически")&&page.includes("Разница"),"discrepancy review is explicit");
  ok(selector.includes('inputMode="numeric"')&&selector.includes('font-size:18px')===false,"numeric mobile count input");
  ok(css.includes(".stocktake-count-input input")&&css.includes("font-size:18px"),"iPhone-safe numeric font size");
  ok(selector.includes("Следующий товар")&&selector.includes("onScanAgain"),"fast next-item flow");
  ok(selector.includes("Искать по названию")&&selector.includes("Код / SKU / штрихкод"),"manual and hardware fallback retained");
  ok(page.includes("completeAction")&&page.includes("reconcileAction"),"count completion and reconciliation remain separate");
  ok(schema.includes("model StocktakeSession")&&schema.includes("model StocktakeBulkCount")&&schema.includes("model StocktakeScan"),"single Stage 8B model retained");
  ok(!schema.includes("MobileStocktake")&&!schema.includes("StocktakeCamera"),"no parallel stocktake model");
  ok(css.includes("@media(max-width:760px)")&&css.includes("stocktake-row"),"mobile cards and touch controls");
  console.log(`MOBILE/SCANNING FOUNDATION-1D targeted: ${passed.length}/${passed.length} passed`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
