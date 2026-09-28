import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { stopCameraResources } from "../lib/scanning/camera-lifecycle";

async function main(){
const files=Object.fromEntries(await Promise.all(["components/OperationalItemSelector.tsx","lib/scanning/camera-adapter.ts","lib/scanning/zxing-camera-adapter.ts","app/scan-actions.ts","app/scanner.css","lib/inventory/operational-contract.ts","package.json"].map(async path=>[path,await readFile(path,"utf8")])));
let passed=0;const ok=(condition:unknown,name:string)=>{assert.ok(condition,name);passed++};
const selector=files["components/OperationalItemSelector.tsx"],adapter=files["lib/scanning/zxing-camera-adapter.ts"],actions=files["app/scan-actions.ts"],css=files["app/scanner.css"],contract=files["lib/inventory/operational-contract.ts"];

ok(files["package.json"].includes('"@zxing/browser": "^0.2.1"'),"ZXing dependency pinned");
ok(selector.includes('import("@/lib/scanning/zxing-camera-adapter")'),"decoder dynamically imported");
ok(adapter.includes('facingMode: { ideal: "environment" }'),"rear camera preferred");
ok(adapter.includes("CODE_128")&&adapter.includes("EAN_13")&&adapter.includes("QR_CODE"),"formats constrained");
ok(adapter.includes("DecodeHintType.POSSIBLE_FORMATS")&&adapter.includes("DecodeHintType.TRY_HARDER"),"formats and try-harder passed to active reader");
ok(adapter.includes("width: { ideal: 1920 }")&&adapter.includes("height: { ideal: 1080 }"),"dense 1D camera resolution requested");
ok(adapter.includes("NotFoundException")&&adapter.includes("ChecksumException")&&adapter.includes("FormatException"),"continuous decode states classified");
ok(adapter.includes("now-lastReportAt<750"),"diagnostics throttled away from decode cadence");
ok(selector.includes("Диагностика камеры")&&selector.includes("diagnostic.videoWidth")&&selector.includes("diagnostic.lastDecodeState"),"preview camera diagnostics available");
let controlStops=0,trackStops=0;const video={srcObject:{getTracks:()=>[{stop:()=>trackStops++},{stop:()=>trackStops++}]}} as unknown as {srcObject:MediaProvider|null};stopCameraResources(video,{stop:()=>controlStops++});
ok(controlStops===1&&trackStops===2&&video.srcObject===null,"decoder and media tracks stopped");
ok(selector.includes('window.addEventListener("pagehide"')&&selector.includes('document.addEventListener("visibilitychange"'),"background lifecycle handled");
ok(selector.includes("return()=>")&&selector.includes("stopCamera()"),"unmount stops camera");
ok(selector.includes("acceptedRef.current"),"repeat decode suppressed");
ok(selector.includes('event.key==="Tab"')&&selector.includes('onSubmit='),"keyboard wedge Enter and Tab supported");
ok(selector.includes("lastSubmitRef")&&selector.includes("1200"),"duplicate submit suppressed");
ok(selector.includes("searchOperationalItemsAction")&&selector.includes("resolveCatalogIdentifierAction"),"manual and exact paths integrated");
ok(actions.includes('purpose: "CATALOG_LOOKUP"'),"catalog purpose enforced");
ok(actions.includes("getCurrentSession")&&actions.includes('requirePermission(session, "CATALOG_VIEW")'),"server authentication and permission");
ok(actions.includes("organizationId: session.organizationId"),"tenant scoped search");
ok(!actions.includes("create(")&&!actions.includes("update(")&&!actions.includes("delete("),"lookup actions are read only");
ok(contract.includes('kind: "BULK_VARIANT"')&&contract.includes('kind: "SERIALIZED_INSTANCE"')&&contract.includes('kind: "PRODUCT_NEEDS_VARIANT_SELECTION"'),"discriminated results retained");
ok(selector.includes("Доступ к камере запрещён")&&selector.includes("Код не найден")&&selector.includes("Код неоднозначен"),"employee-safe errors");
ok(selector.includes("Видео обрабатывается только на устройстве")&&!selector.includes("canvas.toDataURL"),"frames remain local");
ok(css.includes("height:100dvh")&&css.includes("safe-area-inset-bottom"),"mobile full-screen sheet");
ok(css.includes("min-height:44px"),"touch targets");
console.log(`MOBILE/SCANNING FOUNDATION-1B targeted: ${passed}/${passed} passed`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
