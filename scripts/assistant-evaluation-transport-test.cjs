const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {makeEvaluationTransport,REQUEST_TIMEOUT_MS}=require('./lib/assistant-evaluation-transport.cjs');
const {observeTransport}=require('./lib/assistant-transport-diagnostic.cjs');
const {diagnosticRequest}=require('./lib/assistant-http-diagnostic.cjs');
const {transportReport}=require('./assistant-small-smoke.cjs');
const {POLICY,claim,allowance}=require('./lib/assistant-repeat-16-budget.cjs');
const {POLICY:OLD}=require('./lib/assistant-small-smoke.cjs');
const {body,response}=require('./assistant-small-smoke-test.cjs');
function clock(){let now=0,id=0;const queue=new Map();return{now:()=>now,setTimeout(fn,ms){const n=++id;queue.set(n,{fn,at:now+ms});return n},clearTimeout(n){queue.delete(n)},tick(ms){const end=now+ms;for(;;){const next=[...queue].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;queue.delete(next[0]);now=next[1].at;next[1].fn()}now=end}}}
function seed(dir,now){fs.mkdirSync(path.join(dir,'evaluation-repeat-16-resume132'),{recursive:true});fs.writeFileSync(path.join(dir,'started.json'),JSON.stringify({approval:OLD.approval}));fs.writeFileSync(path.join(dir,'evaluation-repeat-16-resume132/result.json'),JSON.stringify({status:'STOPPED',totalCalls:136,reservedNano:2512681600}));for(let n=1;n<=136;n++)fs.writeFileSync(path.join(dir,`attempt-${n}.json`),JSON.stringify({attempt:n,reservedNano:n*18475600}));claim(dir,now())}
(async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-eval90-'));try{
 const checks=[];
 for(const spec of [{name:'delayed35',delay:35000,status:200},{name:'delayed89',delay:89000,status:200},{name:'timeout90',delay:90001,status:200,reason:'EVALUATION_TIMEOUT'},{name:'incomplete300',delay:20,status:200,reason:'INCOMPLETE_OUTPUT',incomplete:true},{name:'401',delay:10,status:401,reason:'HTTP_401'},{name:'429',delay:10,status:429,reason:'HTTP_429'},{name:'503',delay:10,status:503,reason:'HTTP_5XX'}]){
  const dir=path.join(root,spec.name),c=clock(),now=()=>Date.parse('2026-10-17T09:00:00Z')+c.now();seed(dir,now);const out=path.join(dir,'out');fs.mkdirSync(out);let requests=0,destroyed=0;
  const request=(options,callback)=>{requests++;assert.equal(options.hostname,'api.openai.com');assert.equal(options.path,'/v1/responses');assert(fs.existsSync(path.join(dir,'attempt-137.json')),'reserve before request');const req=new EventEmitter();let socketTimer,delivery;
   req.setTimeout=(ms,fn)=>{assert.equal(ms,90000);socketTimer=c.setTimeout(fn,ms);return req};
   req.destroy=()=>{destroyed++;c.clearTimeout(socketTimer);c.clearTimeout(delivery);req.emit('error',{code:'ECONNRESET'})};
   req.end=()=>{delivery=c.setTimeout(()=>{c.clearTimeout(socketTimer);const res=new EventEmitter();res.statusCode=spec.status;res.headers={};callback(res);res.emit('data',Buffer.from(JSON.stringify(spec.status===200?(spec.incomplete?{...response(),status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{...response().usage,output_tokens:300,total_tokens:400}}:response()):{error:{code:'invalid_api_key',type:'authentication_error',message:'DO_NOT_SAVE'}})));res.emit('end')},spec.delay)};return req;
  };
  const observed=observeTransport(request,r=>fs.writeFileSync(path.join(out,'transport-failure.json'),JSON.stringify(r)),c.now);
  const diagnosed=diagnosticRequest(observed,r=>fs.writeFileSync(path.join(out,'http-error.json'),JSON.stringify(r)));
  const transport=makeEvaluationTransport(Buffer.from('sk-SYNTHETIC_ONLY_12345678901234567890'),diagnosed,transportReport(out),c);
  const a=allowance(transport,dir,now);a.beginTurn();const pending=a.provider.create(body(),new AbortController().signal);c.tick(Math.min(spec.delay,90000));
  if(spec.reason){await assert.rejects(pending);assert(a.closed);assert.equal(a.stopReason,spec.reason);assert(!fs.existsSync(path.join(dir,'usage-137.json')));assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'failure-137.json'))).reason,spec.reason);await assert.rejects(()=>a.provider.create(body(),new AbortController().signal));if(spec.status!==200)assert.equal(JSON.parse(fs.readFileSync(path.join(out,'http-error.json'))).status,spec.status)}else{assert.equal((await pending).status,'completed');assert(!a.closed);assert(fs.existsSync(path.join(dir,'usage-137.json')))}
  assert.equal(requests,1);assert.equal(a.counts().reservedNano,137*18475600);assert.equal(fs.readFileSync(path.join(dir,'attempt-136.json'),'utf8'),JSON.stringify({attempt:136,reservedNano:136*18475600}));if(spec.name==='timeout90'){assert.equal(destroyed,1);assert.equal(c.now(),90000)}
  assert(!fs.readFileSync(path.join(out,'transport.json'),'utf8').includes('DO_NOT_SAVE'));transport.dispose();checks.push(spec.name);
 }
 assert.equal(REQUEST_TIMEOUT_MS,90000);assert.equal(POLICY.maxTotalNano,4877558400);
 assert(fs.readFileSync(path.join(__dirname,'assistant-evaluation-suite.cjs'),'utf8').includes('AbortSignal.timeout(380000)'));
 console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,virtualClock:true,checks,requestTimeoutMs:90000,turnTimeoutMs:380000,unknownReserveRetained:true,noPaidRetry:true,maxAggregateReserveUsd:4.8775584}));
}finally{fs.rmSync(root,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
