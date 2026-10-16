const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {POLICY,allowance}=require('./lib/assistant-small-smoke.cjs'),{checkAfter401,claimAfter401}=require('./lib/assistant-smoke-after401.cjs'),{body,response}=require('./assistant-small-smoke-test.cjs'),{diagnosticRequest}=require('./lib/assistant-http-diagnostic.cjs');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-attempt3-'));const now=()=>Date.parse('2026-10-16T18:30:00Z');
 try{
  fs.mkdirSync(path.join(dir,'resume-evidence'));const records={'started.json':{approval:POLICY.approval,budgetNano:POLICY.budgetNano},'resume-started.json':{approval:POLICY.approval,priorReservedNano:POLICY.reserveNano},'attempt-1.json':{attempt:1,reservedNano:POLICY.reserveNano},'attempt-2.json':{attempt:2,reservedNano:2*POLICY.reserveNano},'resume-evidence/result.json':{status:'STOPPED',attempts:2,reservedTokenUsd:0.0369512},'resume-evidence/transport.json':[{stage:'HTTP_STATUS',status:401}]};
  for(const [n,v]of Object.entries(records))fs.writeFileSync(path.join(dir,n),JSON.stringify(v));
  assert.equal(checkAfter401(dir,now()).initialCount,2);assert(!fs.existsSync(path.join(dir,'resume-after401-started.json')));
  const options=claimAfter401(dir,now());assert.throws(()=>claimAfter401(dir,now()));let calls=0;
  const a=allowance({responses:{create:async()=>{calls++;return response()}}},dir,now,options);assert.equal(a.reservedNano,36951200);
  for(let t=0;t<2;t++){a.beginTurn();for(let i=0;i<4;i++)await a.provider.create(body(),new AbortController().signal)}
  await assert.rejects(()=>a.provider.create(body(),new AbortController().signal));assert.equal(calls,8);assert.equal(a.count,10);assert.equal(a.reservedNano,184756000);assert.throws(()=>a.beginTurn());
  for(const [n,v]of Object.entries(records))assert.equal(fs.readFileSync(path.join(dir,n),'utf8'),JSON.stringify(v));
  assert.throws(()=>checkAfter401(dir,POLICY.validUntil));
  const saved=[];let requests=0;
  for(const payload of [JSON.stringify({error:{code:'invalid_api_key',type:'invalid_request_error',message:'DO_NOT_SAVE',param:'DO_NOT_SAVE'}}),'not JSON','x'.repeat(17000),JSON.stringify({error:{code:'DO_NOT_SAVE',type:'DO_NOT_SAVE'}})]){
   const opts={headers:{Authorization:'Bearer SYNTHETIC'}};
   const wrapped=diagnosticRequest((received,callback)=>{requests++;assert.equal(received,opts);const res=new EventEmitter();res.statusCode=401;res.headers={'x-request-id':'req_12345678abcdef12','set-cookie':'DO_NOT_SAVE'};callback(res);res.emit('data',Buffer.from(payload));res.emit('end');return 'request'},data=>saved.push(data));
   assert.equal(wrapped(opts,()=>{}),'request');
  }
  assert.equal(requests,4);assert.equal(saved[0].code,'invalid_api_key');assert.equal(saved[0].type,'invalid_request_error');assert.equal(saved[0].requestId,'req_12345678abcdef12');assert(saved.slice(1).every(s=>s.code===null&&s.type===null));assert(!JSON.stringify(saved).includes('DO_NOT_SAVE'));assert.deepEqual(Object.keys(saved[0]).sort(),['code','requestId','status','type']);
  console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,priorReserveUsd:0.0369512,maxNewCalls:8,maxTotalReserveUsd:0.184756,checks:['atomic-one-use','old-ledger-preserved','counter-from-three','eight-call-two-turn-limits','expiry','same-request-no-auth-mutation','only-allowlisted-error-metadata','oversized-malformed-secret-fields-discarded']}));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
