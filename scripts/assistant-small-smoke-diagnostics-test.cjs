const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {allowance,claim}=require('./lib/assistant-small-smoke.cjs');
const {body,response}=require('./assistant-small-smoke-test.cjs');
const {transportReport,preflightFailure}=require('./assistant-small-smoke.cjs');
const now=()=>Date.parse('2026-10-16T15:00:00Z');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-diagnostics-'));
 try{
  for(const kind of ['transport','usage']){
   const dir=path.join(root,kind);claim(dir,now());
   const a=allowance({responses:{create:async()=>{if(kind==='transport')throw Error('DO_NOT_SAVE_SECRET');const r=response();delete r.usage.input_tokens_details.cache_write_tokens;r.output_text='DO_NOT_SAVE_SECRET';return r}}},dir,now);a.beginTurn();
   await assert.rejects(()=>a.provider.create(body(),new AbortController().signal));
   const text=fs.readFileSync(path.join(dir,'failure-1.json'),'utf8'),d=JSON.parse(text);
   assert(!text.includes('DO_NOT_SAVE_SECRET'));assert.equal(d.stage,kind==='transport'?'TRANSPORT':'RESPONSE_VALIDATION');
   if(kind==='usage'){assert.equal(d.observed.cacheWriteTokens,null);assert.equal(d.observed.inputTokens,100);assert.equal(d.observed.modelMatches,true)}
   assert.equal(a.count,1);assert.equal(a.reservedNano,18475600);assert(a.closed);assert.throws(()=>claim(dir,now()));
  }
  const report=transportReport(root);report.transportReady();report.httpStart();report.httpStatus(401);report.error('DO_NOT_SAVE_SECRET');
  const text=fs.readFileSync(path.join(root,'transport.json'),'utf8'),events=JSON.parse(text);assert(!text.includes('DO_NOT_SAVE_SECRET'));assert.equal(events[2].status,401);assert.equal(events[3].code,'UNKNOWN');
  assert.equal(report.summary(),'AUTHENTICATION_REJECTED');
  assert.equal(preflightFailure(Error('RESUME_ALREADY_USED_OR_UNEXPECTED_HISTORY')).code,'RESUME_ALREADY_USED_OR_UNEXPECTED_HISTORY');
  assert.equal(preflightFailure(Error('DO_NOT_SAVE_SECRET')).code,'READINESS_FAILED');
  console.log(JSON.stringify({status:'OFFLINE_PASS',checks:['transport-stage','missing-counter-stage','no-secret-or-response-text','http-status-allowlist','no-budget-refund-or-retry'],networkCalls:0}));
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
