// Actual runner/runtime/tool pipeline; scripted wire responses, no paid calls.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),Module=require('node:module');
const load=Module._load;Module._load=function(k,...a){if(/^(?:node:)?(?:https?|net|tls)$/.test(k))throw Error('NETWORK_FORBIDDEN');return load.call(this,k,...a)};
const {POLICY,claim,allowance}=require('./lib/assistant-repeat-16-budget.cjs');
const {POLICY:OLD}=require('./lib/assistant-small-smoke.cjs');
const {runCases}=require('./lib/assistant-repeat-runner.cjs');
const suite=require('./assistant-evaluation-suite.cjs');
const {makeTransport}=require('./assistant-smoke-local.cjs');
const {transportReport}=require('./assistant-small-smoke.cjs');
const {body}=require('./assistant-small-smoke-test.cjs');
const ids=require('../docs/assistant-repeat-prepared-20261016.json').scenarioIds,specs=ids.map(id=>suite.cases.find(c=>c.id===id));
const now=()=>Date.parse('2026-10-17T07:00:00Z');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function seed(dir){fs.mkdirSync(path.join(dir,'evaluation-repeat-16'),{recursive:true});fs.writeFileSync(path.join(dir,'started.json'),JSON.stringify({approval:OLD.approval}));fs.writeFileSync(path.join(dir,'evaluation-repeat-16/result.json'),JSON.stringify({status:'STOPPED',totalCalls:132,reservedNano:2438779200}));for(let n=1;n<=132;n++)fs.writeFileSync(path.join(dir,`attempt-${n}.json`),JSON.stringify({attempt:n,reservedNano:n*18475600}));claim(dir,now());const out=path.join(dir,'evidence');fs.mkdirSync(out);return out}
function wire(data,tokens=150){return{status:'completed',model:OLD.model,service_tier:'default',output:[],output_text:JSON.stringify(data),usage:{input_tokens:5000,output_tokens:tokens,total_tokens:5000+tokens,input_tokens_details:{cached_tokens:0,cache_write_tokens:0},output_tokens_details:{reasoning_tokens:0}}}}
const final=(changes=[],cards=[])=>({message:'Учла ваши пожелания.',preferenceChanges:changes,cardIds:cards,productRefs:[],factRefs:[]});
const tool=(name,args)=>({...wire({}),output:[{type:'function_call',call_id:name,name,arguments:JSON.stringify(args)}]});
const verdict={safeSentenceIds:[0],preferenceDecision:'allow',reason:'all_safe'};
(async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-resume-lifecycle-'));try{
 for(const missingUsage of [false,true]){
  const dir=path.join(root,'incomplete-'+missingUsage),out=seed(dir);let calls=0;
  const patch={field:'color',slot:'dress',value:'синее',quote:'синее'};
  const steps=[tool('find_dresses',{slot:'dress'}),wire(final([],[id(20)])),wire(verdict),tool('remember_preferences',{changes:[patch]}),tool('read_batch',{requests:[{name:'find_cheaper',slot:'dress',referenceVariantId:id(20)}]}),wire(final([patch],[id(21)])),{...wire(verdict,300),status:'incomplete',incomplete_details:{reason:'max_output_tokens'},...(missingUsage?{usage:null}:{})}];
  const a=allowance({responses:{create:async()=>steps[calls++]}},dir,now);
  const result=await runCases(a,specs,suite,out);assert.equal(calls,7);assert.equal(result.status,'STOPPED');assert.equal(result.stopReason,'INCOMPLETE_OUTPUT');assert.equal(result.notRun,15);assert.equal(result.passed,0);assert.equal(result.reservedNano,139*18475600);
  const rows=JSON.parse(fs.readFileSync(path.join(out,'scorecard.json'),'utf8')).results;assert.equal(rows[0].taskStatus,'FAIL');assert.equal(rows[0].checks.cheaperToolSucceeded,true);assert(rows.slice(1).every(r=>r.status==='NOT_RUN'&&r.safetyStatus==='NOT_EVALUATED'));
  assert(fs.existsSync(path.join(out,'colour-cheaper/turn-2.json')));assert(!fs.existsSync(path.join(dir,'usage-139.json')));const failure=JSON.parse(fs.readFileSync(path.join(dir,'failure-139.json')));assert.equal(failure.observed.incompleteReason,'max_output_tokens');await assert.rejects(()=>a.provider.create(body(),new AbortController().signal));assert.equal(calls,7);
 }
 // HTTP 401 through the real direct transport with a fake request object.
 {
  const dir=path.join(root,'http401'),out=seed(dir);let sent=0;
  const request=(_options,callback)=>{const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{};req.end=()=>{sent++;const res=new EventEmitter();res.statusCode=401;callback(res);res.emit('data',Buffer.from('{}'));res.emit('end')};return req};
  const transport=makeTransport(Buffer.from('sk-SYNTHETIC_ONLY_12345678901234567890'),request,transportReport(out));const a=allowance(transport,dir,now);const r=await runCases(a,specs,suite,out);transport.dispose();assert.equal(sent,1);assert.equal(r.notRun,15);assert.equal(r.stopReason,'HTTP_OR_TRANSPORT_FAILURE');assert.equal(r.reservedNano,133*18475600);assert(JSON.parse(fs.readFileSync(path.join(out,'transport.json'))).some(e=>e.status===401));
 }
 // A local, invalid card reference fails that case, but does not stop later cases.
 {
  const dir=path.join(root,'local-fail'),out=seed(dir);let calls=0;
  const a=allowance({responses:{create:async b=>{calls++;if(calls===1)return wire(final([],[id(99)]));return wire(b.text.format.name==='conversation_boundary_review'?verdict:final())}}},dir,now);
  const r=await runCases(a,specs,suite,out);assert.equal(r.status,'EVALUATION_COMPLETED');assert.equal(r.notRun,0);assert.equal(r.scenarios,16);assert.equal(r.passed,0);assert(calls<=128);assert.equal(JSON.parse(fs.readFileSync(path.join(out,'scorecard.json'))).results[0].failure,'CARD_NOT_VERIFIED');
 }
 // Exhausting the call limit is diagnosed before another transport call.
 {
  const dir=path.join(root,'cap'),out=seed(dir);let calls=0;const a=allowance({responses:{create:async()=>{calls++;return wire({})}}},dir,now);
  for(let t=0;t<32;t++){a.beginTurn();for(let i=0;i<4;i++)await a.provider.create(body(),new AbortController().signal)}
  await assert.rejects(()=>a.provider.create(body(),new AbortController().signal));assert.equal(a.stopReason,'CALL_OR_TURN_LIMIT');assert.equal(calls,128);const r=await runCases(a,specs,suite,out);assert.equal(r.notRun,16);assert.equal(r.reservedNano,4803656000);assert.equal(r.status,'STOPPED');
 }
 console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,scenarios:16,maxNewCalls:128,maxAggregateReserveUsd:4.803656,checks:['reviewer-incomplete-with-usage','reviewer-incomplete-without-usage','saved-fallback-is-fail','batched-cheaper-recognized','remaining-scenarios-not-run','real-transport-simulated-401-no-retry','local-ID-failure-continues','budget-stop-before-transport','actual-request-size-and-tool-policy']}));
}finally{fs.rmSync(root,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
