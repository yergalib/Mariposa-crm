// In-memory transport/accounting fixtures. No network, credentials or database.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
let reservations=0,receipts=0,requests=0,mode='ok',events=[],controller;
class AssistantError extends Error {}
function load(name){const loaded={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,'lib/assistant/chat',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=n=>{
  if(n==='server-only')return {};
  if(n==='./limits')return {AssistantError};
  if(n==='./diagnostics')return load('diagnostics');
  if(n==='./owner-test')return {ownerTestConfig:()=>true};
  if(n==='./owner-test-request')return {ownerRequest:body=>({body,bytes:100,outputCap:300}),verifiedOwnerUsage:r=>{if(mode==='invalid')throw Error('invalid usage');return 1}};
  if(n==='./usage-summary')return {usageSummary:()=>({})};
  if(n==='./provider-budget')return {reserveProviderCall:async()=>{reservations++;return async()=>{if(mode==='receipt-error')throw Error('persistence failed');receipts++}}};
  if(n==='openai')return class {responses={create:async()=>{requests++;if(mode==='transport-error')throw Error('unknown outcome');if(mode==='late')controller.abort();return {status:'completed',output:[],output_text:'fixture'}}}};
  throw Error('Unexpected import '+n);
 };
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Date,process:{env:{OPENAI_API_KEY:'fixture'}},console})(req,loaded,loaded.exports);return loaded.exports;
}
const {openAIProvider}=load('provider'),d=load('diagnostics');
const body={text:{format:{type:'json_schema',name:'conversation_boundary_review'}}};
async function run(m,remaining=20000){mode=m;events=[];controller=new AbortController();return openAIProvider({}, {deadlineAt:Date.now()+remaining,diagnostic:e=>events.push(e)}).create(body,controller.signal)}
(async()=>{
 await assert.rejects(run('ok',100));assert.equal(reservations,0);assert.equal(requests,0);
 await run('ok');assert.equal(receipts,1);
 await assert.rejects(run('late'));assert.equal(receipts,2);assert(events.some(e=>e.outcome==='verified'));assert(!events.some(e=>e.outcome==='request_unverified'));
 for(const m of ['transport-error','invalid','receipt-error']){const before=receipts;await assert.rejects(run(m));assert.equal(receipts,before);assert.equal(events.filter(e=>e.outcome==='reserved').length,1);assert(!events.some(e=>e.outcome==='verified'));}
 assert.equal(requests,5,'no automatic retries');assert.equal(reservations,5);
 d.emitDiagnostic(()=>{throw Error('observer failure')},{stage:'provider',outcome:'verified'});
 d.assertProviderStartTime(11000,'review',undefined,1000);
 assert.throws(()=>d.assertProviderStartTime(10999,'review',undefined,1000));
 for(const e of events)assert(Object.keys(e).every(k=>['stage','kind','outcome','elapsedMs','remainingMs'].includes(k)));
 console.log('PASS: deadline before reservation; late receipt settled without answer; unknown/invalid/persistence failure retained; no retries; observer isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
