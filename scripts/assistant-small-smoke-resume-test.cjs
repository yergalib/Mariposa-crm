const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {POLICY,claim,allowance}=require('./lib/assistant-small-smoke.cjs');
const {checkResume,claimResume}=require('./lib/assistant-small-smoke-resume.cjs');
const {body,response}=require('./assistant-small-smoke-test.cjs');
const now=()=>Date.parse('2026-10-16T15:15:00Z');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-resume-'));let calls=0;
 try{
  claim(dir,now());fs.writeFileSync(path.join(dir,'attempt-1.json'),JSON.stringify({attempt:1,turn:1,reservedNano:POLICY.reserveNano,payloadBytes:16581}));fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({status:'STOPPED',attempts:1,reservedTokenUsd:0.0184756,noRetry:true}));
  const original=Object.fromEntries(['started.json','attempt-1.json','result.json'].map(n=>[n,fs.readFileSync(path.join(dir,n),'utf8')]));
  assert.equal(checkResume(dir,now()).initialCount,1);assert(!fs.existsSync(path.join(dir,'resume-started.json')));
  const options=claimResume(dir,now());assert.throws(()=>claimResume(dir,now()));assert.throws(()=>claim(dir,now()));
  const a=allowance({responses:{create:async()=>{calls++;return response()}}},dir,now,options);
  assert.equal(a.count,1);assert.equal(a.reservedNano,18475600);assert.equal(POLICY.budgetNano-a.reservedNano,231524400);
  for(let turn=0;turn<2;turn++){a.beginTurn();for(let i=0;i<4;i++)await a.provider.create(body(),new AbortController().signal)}
  await assert.rejects(()=>a.provider.create(body(),new AbortController().signal),/BUDGET_LIMIT/);assert.equal(calls,8);assert.equal(a.count,9);assert.equal(a.reservedNano,166280400);assert.throws(()=>a.beginTurn(),/TURN_LIMIT/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'attempt-2.json'),'utf8')).reservedNano,36951200);
  for(const [name,content]of Object.entries(original))assert.equal(fs.readFileSync(path.join(dir,name),'utf8'),content);
  assert.throws(()=>checkResume(dir,POLICY.validUntil));
  console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,priorReserveUsd:0.0184756,remainingAuthorizationUsd:0.2315244,maxNewCalls:8,maxTotalReserveUsd:0.1662804,checks:['original-ledger-preserved','atomic-single-resume','counter-starts-at-two','no-refund','eight-new-call-cap','two-turn-cap','expiry']}));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
