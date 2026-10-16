const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {POLICY,snapshot,usage,claim,allowance}=require('./lib/assistant-small-smoke.cjs');
const now=()=>Date.parse('2026-10-16T15:00:00Z');
const body=()=>({model:POLICY.model,store:false,service_tier:'default',reasoning:{effort:'none',mode:'standard'},max_output_tokens:1400,instructions:'safety',input:[{role:'user',content:'hello'}],text:{format:{type:'json_schema',name:'consultant_reply',strict:true,schema:{type:'object'}}},tools:[],parallel_tool_calls:false,tool_choice:'auto'});
const response=()=>({status:'completed',model:POLICY.model,service_tier:'default',usage:{input_tokens:100,output_tokens:10,total_tokens:110,input_tokens_details:{cached_tokens:20,cache_write_tokens:30},output_tokens_details:{reasoning_tokens:0}},output:[],output_text:'{}'});
async function test(){
 let checks=0,calls=0;const dirs=[];const dir=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-budget-'));dirs.push(d);return d};
 try{
 assert.equal(POLICY.maxCalls*POLICY.reserveNano,221707200);assert(POLICY.maxCalls*POLICY.reserveNano<=POLICY.budgetNano);checks++;
 const b=body(),s=snapshot(b);b.instructions='changed';assert.equal(s.instructions,'safety');assert(Object.isFrozen(s.input[0]));checks++;
 const huge=body();huge.instructions='я'.repeat(24000);assert.throws(()=>snapshot(huge),/PAYLOAD_LIMIT/);assert.equal(huge.instructions.length,24000);checks++;
 for(const field of ['previous_response_id','conversation','background'])assert.throws(()=>snapshot({...body(),[field]:'forbidden'}));checks+=3;
 for(const type of ['input_image','input_file'])assert.throws(()=>snapshot({...body(),input:[{role:'user',content:[{type}]}]}));checks+=2;
 assert.throws(()=>snapshot({...body(),tools:[{type:'web_search'}]}));checks++;
 assert.throws(()=>snapshot({...body(),input:[{type:'reasoning',summary:[],encrypted_content:'remote'}]}));checks++;
 assert.equal(usage(response(),1400).estimatedNano,15345);checks++;
 const d=dir();claim(d,now());assert.throws(()=>claim(d,now()),/APPROVAL_ALREADY_USED/);checks++;
 const a=allowance({responses:{create:async()=>{calls++;return response()}}},d,now);a.beginTurn();for(let i=0;i<12;i++)await a.provider.create(body(),new AbortController().signal);await assert.rejects(()=>a.provider.create(body(),new AbortController().signal),/BUDGET_LIMIT/);assert.equal(calls,12);checks++;
 a.beginTurn();a.beginTurn();assert.throws(()=>a.beginTurn(),/TURN_LIMIT/);checks++;
 for(const fail of [()=>{throw Error('network unknown')},()=>({...response(),usage:null})]){const x=dir();claim(x,now());const c=allowance({responses:{create:async()=>fail()}},x,now);c.beginTurn();await assert.rejects(()=>c.provider.create(body(),new AbortController().signal));assert.equal(c.count,1);assert.equal(c.closed,true);await assert.rejects(()=>c.provider.create(body(),new AbortController().signal));checks++}
 let time=now();const x=dir();claim(x,time);const c=allowance({responses:{create:async()=>{throw Error('must not send')}}},x,()=>time);c.beginTurn();time+=900000;await assert.rejects(()=>c.provider.create(body(),new AbortController().signal));assert.equal(c.count,0);checks++;
 return {status:'OFFLINE_PASS',checks,networkCalls:0,secretReads:0,maxReservedUsd:POLICY.maxCalls*POLICY.reserveNano/1e9};
 }finally{for(const d of dirs)fs.rmSync(d,{recursive:true,force:true})}
}
module.exports={test,body,response};
if(require.main===module)test().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1});
