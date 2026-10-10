// Real server action; isolated dependency adapter, no DB/network/session writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=process.env.CRM_TEST_ROOT||path.resolve(__dirname,'..');
const req=require('node:module').createRequire(path.join(root,'package.json')),ts=req('typescript');
let commandError,authError,destination,calls;
const redirectError=Object.assign(new Error('redirect'),{digest:'NEXT_REDIRECT'}),actor={organizationId:'test-org'};
const moduleValue={exports:{}};
const code=ts.transpileModule(fs.readFileSync(path.join(root,'app/sales/return-actions.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{FormData,URLSearchParams,Error})(name=>{
 if(name==='next/navigation')return{unstable_rethrow:e=>{if(e===redirectError)throw e}};
 if(name==='next/cache')return{revalidatePath:p=>calls.push(p)};
 if(name==='@/lib/auth/session')return{requireRouteAccess:async()=>{if(authError)throw authError;return actor}};
 if(name==='@/lib/tenant/context')return{createTenantContext:organizationId=>({organizationId})};
 if(name==='@/lib/sales/returns')return{recordSaleReturn:async()=>{if(commandError)throw commandError}};
 if(name==='@/lib/orders/action-navigation')return{redirectWithOrderContext:async url=>{await Promise.resolve();destination=url;throw redirectError}};
 throw Error('Unknown dependency '+name);
},moduleValue,moduleValue.exports);
(async()=>{const form=new FormData();form.set('orderId','test-order');calls=[];await assert.rejects(moduleValue.exports.saleReturnAction(form),e=>e===redirectError);assert(destination.includes('?ok='));assert(calls.includes('/orders/test-order'));console.log('PASS success awaits framework redirect');
 commandError=new Error('inspection rejected');calls=[];await assert.rejects(moduleValue.exports.saleReturnAction(form),e=>e===redirectError);assert(destination.includes('error=inspection+rejected'));console.log('PASS validation error awaits error redirect');
 commandError=undefined;authError=redirectError;calls=[];destination=undefined;await assert.rejects(moduleValue.exports.saleReturnAction(form),e=>e===redirectError);assert.equal(destination,undefined);assert.deepEqual(calls,[]);console.log('PASS auth redirect remains framework control flow');})().catch(e=>{console.error(e);process.exitCode=1});
