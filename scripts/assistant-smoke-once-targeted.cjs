const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {reserveRun,wrapReservedProvider,runApprovedSmoke,createSyntheticRun,POLICY,LIVE_READINESS}=require('./lib/assistant-smoke-once.cjs');
const now=Date.parse('2026-10-09T12:00:00Z'),expiresAt=now+60000;
if(process.argv[2]==='claim'){try{reserveRun(process.argv[3],expiresAt,now);process.exit(0);}catch{process.exit(2);}}
global.fetch=()=>{throw Error('LIVE NETWORK FORBIDDEN')};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-smoke-adapter-'));
const signal=()=>new AbortController().signal;
const body={model:POLICY.model,service_tier:'default',store:false,reasoning:{effort:'none',mode:'standard'},max_output_tokens:1400,instructions:'Synthetic',input:[{role:'user',content:'Synthetic user'},{role:'assistant',content:'Synthetic history'}],tools:[{type:'function',name:'get_rental_rules',description:'Read rules',strict:true,parameters:{type:'object',properties:{},required:[],additionalProperties:false}}],parallel_tool_calls:false,tool_choice:'auto',text:{format:{type:'json_schema',name:'fixture',strict:true,schema:{type:'object',properties:{message:{type:'string'}},required:['message'],additionalProperties:false}}}};
const response=(input=24000,output=1400)=>({model:POLICY.model,service_tier:'default',status:'completed',output:[],output_text:'Synthetic',usage:{input_tokens:input,output_tokens:output,total_tokens:input+output,input_tokens_details:{cached_tokens:0,cache_write_tokens:input},output_tokens_details:{reasoning_tokens:output}}});
const count=n=>({type:'count',value:{object:'response.input_tokens',input_tokens:n}}),pair=()=>[count(24000),{type:'create',value:response()}];
const run=(opts={})=>createSyntheticRun({steps:pair(),now:()=>now,expiresAt,...opts});
const pairCost=3701000;
(async()=>{
 assert.equal(POLICY.maxCalls,6);assert.ok(POLICY.maxRunNano<=1e9);assert.equal(LIVE_READINESS.preflightMaxNano,null);
 let touched=0;const forbidden=new Proxy({},{get(){touched++;throw Error('network client touched')}});
 assert.throws(()=>wrapReservedProvider(forbidden),/LIVE_SMOKE_BLOCKED/);await assert.rejects(()=>runApprovedSmoke(forbidden,()=>{touched++}),/LIVE_SMOKE_BLOCKED/);assert.equal(touched,0);
 for(const price of [null,-1,NaN,1.1,'0'])assert.throws(()=>run({preflightMaxNano:price}));
 const file=path.join(root,'concurrent.json');const claim=()=>new Promise(resolve=>{const c=spawn(process.execPath,[__filename,'claim',file],{stdio:'ignore',windowsHide:true});c.on('exit',resolve)});
 const claims=await Promise.all([claim(),claim(),claim(),claim()]);assert.equal(claims.filter(n=>n===0).length,1);assert.throws(()=>reserveRun(file,expiresAt,now));
 const s=run({steps:[...pair(),...pair(),...pair()]});
 await s.provider.create(body,signal());await s.anotherProvider().create(body,signal());await s.limited.create(body,signal());
 await assert.rejects(()=>s.anotherProvider().create(body,signal()),/closed/);assert.equal(s.calls.length,6);assert.equal(s.limited.reservedNano,3*pairCost);assert.equal(s.limited.observedNano,3*3700000);
 for(let i=0;i<6;i+=2){const a=s.calls[i],b=s.calls[i+1];for(const k of ['model','instructions','input','text','reasoning','tools','parallel_tool_calls','tool_choice'])assert.deepEqual(a.body[k],b.body[k]);assert.equal(a.options.maxRetries,0);assert.equal(b.options.maxRetries,0);assert.ok(Object.isFrozen(a.body.tools[0].parameters));}
 for(const remaining of [0,pairCost-1,pairCost,2*pairCost-1,2*pairCost]){
   const s=run({remainingNano:remaining,steps:[...pair(),...pair(),...pair()]});const allowed=Math.floor(remaining/pairCost);
   for(let i=0;i<allowed;i++)await s.provider.create(body,signal());
   await assert.rejects(()=>s.provider.create(body,signal()),/closed/);assert.equal(s.calls.length,allowed*2);assert.ok(s.limited.remainingNano>=0);assert.ok(s.limited.reservedNano<=remaining);
 }
 const expensive=run({preflightMaxNano:POLICY.maxRunNano});await assert.rejects(()=>expensive.provider.create(body,signal()),/closed/);assert.equal(expensive.calls.length,0);
 for(const stage of ['count','create']){
   const s=run({remainingNano:pairCost,steps:stage==='count'?[{type:'count',error:'Synthetic timeout'}]:[count(24000),{type:'create',error:'Synthetic timeout'}]});
   await assert.rejects(()=>s.provider.create(body,signal()),/Synthetic timeout/);await assert.rejects(()=>s.anotherProvider().create(body,signal()),/closed/);assert.equal(s.calls.length,stage==='count'?1:2);assert.equal(s.limited.reservedNano,pairCost);assert.equal(s.limited.remainingNano,0);
 }
 for(let failure=0;failure<6;failure++){
   const steps=[...pair(),...pair(),...pair()];steps[failure]={type:steps[failure].type,error:'Late synthetic failure'};const s=run({steps});
   for(let i=0;i<Math.floor(failure/2);i++)await s.provider.create(body,signal());
   await assert.rejects(()=>s.provider.create(body,signal()),/Late synthetic failure/);await assert.rejects(()=>s.anotherProvider().create(body,signal()),/closed/);
   assert.equal(s.calls.length,failure+1);assert.equal(s.limited.reservedNano,(Math.floor(failure/2)+1)*pairCost);assert.ok(s.limited.remainingNano>=0);
 }
 const large=run();await large.provider.create({...body,instructions:'x'.repeat(40000)},signal());assert.equal(large.calls[0].body.instructions.length,40000);
 for(const n of [24001,-1,1.5,'12']){const s=run({steps:[count(n)]});await assert.rejects(()=>s.provider.create(body,signal()));await assert.rejects(()=>s.provider.create(body,signal()),/closed/);assert.equal(s.calls.length,1);assert.equal(s.limited.reservedNano,pairCost);}
 const mutate=[r=>delete r.usage,r=>r.model='other',r=>r.service_tier='fast',r=>r.status='incomplete',r=>r.usage.output_tokens=1401,r=>r.usage.input_tokens=23999,r=>r.usage.total_tokens=1,r=>delete r.usage.input_tokens_details.cache_write_tokens,r=>r.usage.input_tokens_details.cached_tokens=1,r=>r.usage.output_tokens_details.reasoning_tokens=1401];
 for(const change of mutate){const r=response();change(r);const s=run({steps:[count(24000),{type:'create',value:r}]});await assert.rejects(()=>s.provider.create(body,signal()));await assert.rejects(()=>s.provider.create(body,signal()),/closed/);assert.equal(s.calls.length,2);}
 const bad=run();for(const b of [{...body,tools:[{type:'web_search'}]},{...body,model:'other'},{...body,store:true},{...body,max_output_tokens:1401},{...body,parallel_tool_calls:true},{...body,previous_response_id:'x'},{...body,service_tier:'auto'},{...body,instructions:'x'.repeat(48001)},{...body,reasoning:{effort:'none',mode:'pro'}},{...body,input:[{role:'user',content:[{type:'input_image',image_url:'https://invalid'}]}]},{...body,input:[{type:'function_call_output',call_id:'unknown',output:'x'}]}])await assert.rejects(()=>bad.provider.create(b,signal()),/outside/);
 let getterCalls=0;const getter={...body};Object.defineProperty(getter,'instructions',{enumerable:true,get(){getterCalls++;return 'x'}});await assert.rejects(()=>bad.provider.create(getter,signal()),/outside/);assert.equal(getterCalls,0);assert.equal(bad.calls.length,0);
 {let release;const s=run({pauseCount:new Promise(r=>release=r)}),mutable=structuredClone(body),pending=s.provider.create(mutable,signal());mutable.tools[0].description='mutated';await assert.rejects(()=>s.anotherProvider().create(body,signal()),/closed/);release();await pending;assert.equal(s.calls.length,2);assert.equal(s.calls[1].body.tools[0].description,'Read rules');assert.equal(s.limited.reservedNano,pairCost);}
 for(const stop of ['expire','abort','close']){let time=now,release;const controller=new AbortController(),s=run({now:()=>time,pauseCount:new Promise(r=>release=r)});const pending=s.provider.create(body,controller.signal);if(stop==='expire')time=expiresAt;else if(stop==='abort')controller.abort();else s.limited.close();release();await assert.rejects(()=>pending,/closed/);assert.equal(s.calls.length,1);assert.equal(s.limited.reservedNano,pairCost);}
 const stale=run({now:()=>POLICY.ratesValidUntil});await assert.rejects(()=>stale.provider.create(body,signal()),/closed/);assert.equal(stale.calls.length,0);
 process.env.VERCEL_ENV='preview';assert.throws(()=>reserveRun(path.join(root,'serverless.json'),expiresAt,now));delete process.env.VERCEL_ENV;
 assert.throws(()=>reserveRun(path.join(root,'stale.json'),POLICY.ratesValidUntil+1,POLICY.ratesValidUntil-100));
 console.log(JSON.stringify({status:'PASS',realRequests:0,maxHttpAttempts:6,maxGenerationRequests:3,threePairSyntheticReserveUsd:3*pairCost/1e9,runCeilingUsd:POLICY.maxRunNano/1e9,coverage:'shared facades/turns; exact count snapshot incl tools/history; budget boundaries; atomic ledger race/replay; errors without refunds/retries; concurrent calls; mutation; expiry/abort/close; unknown prices and live entry blocked',evidence:root},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
