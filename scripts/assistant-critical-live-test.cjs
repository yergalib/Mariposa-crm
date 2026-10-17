const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let network=0;for(const name of ['node:http','node:https'])require(name).request=()=>{network++;throw Error('NETWORK_FORBIDDEN')};global.fetch=()=>{network++;throw Error('NETWORK_FORBIDDEN')};
const {POLICY,check,claim,allowance}=require('./lib/assistant-critical-budget.cjs');
const {POLICY:OLD}=require('./lib/assistant-small-smoke.cjs');
const {body,response}=require('./assistant-small-smoke-test.cjs');
const {prepare,specifications}=require('./assistant-critical-recheck.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-critical-lifecycle-')),now=()=>Date.parse('2026-10-17T07:30:00Z');
function seed(name){const dir=path.join(root,name);fs.mkdirSync(dir);fs.mkdirSync(path.join(dir,'evaluation-repeat-16-resume136'));fs.writeFileSync(path.join(dir,'started.json'),JSON.stringify({approval:OLD.approval}));fs.writeFileSync(path.join(dir,'evaluation-repeat-16-resume136/result.json'),JSON.stringify({status:'EVALUATION_COMPLETED',totalCalls:239,reservedNano:4415668400}));for(let n=1;n<=239;n++){fs.writeFileSync(path.join(dir,`attempt-${n}.json`),JSON.stringify({attempt:n,reservedNano:n*18475600}));if(![1,2,132,136].includes(n))fs.writeFileSync(path.join(dir,`usage-${n}.json`),'{}')}return dir}
const signal=()=>new AbortController().signal;
(async()=>{
 const dir=seed('maximum'),before=prepare(dir);check(dir,now());assert.equal(prepare(dir).ledgerFingerprint,before.ledgerFingerprint);assert(!fs.existsSync(path.join(dir,'critical-recheck239-started.json')));claim(dir,now());assert.throws(()=>claim(dir,now()),/APPROVAL_ALREADY_USED/);
 let calls=0;const a=allowance({responses:{create:async(_,opts)=>{calls++;assert.equal(opts.maxRetries,0);assert.equal(opts.timeout,90000);assert(fs.existsSync(path.join(dir,`attempt-${239+calls}.json`)),'reserve before transport');return response()}}},dir,now);
 assert.throws(()=>allowance({},dir,now),/EEXIST/);
 for(const id of POLICY.scenarioIds){a.beginScenario(id);for(let turn=0;turn<2;turn++){a.beginTurn();for(let i=0;i<4;i++)await a.provider.create(body(),signal())}}
 await assert.rejects(()=>a.provider.create(body(),signal()));assert.equal(calls,24);assert.equal(a.counts().totalCalls,263);assert.equal(a.counts().reservedNano,4859082800);assert(!fs.existsSync(path.join(dir,'attempt-264.json')));
 for(let n=1;n<=239;n++)assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,`attempt-${n}.json`),'utf8')),{attempt:n,reservedNano:n*18475600});for(const n of [1,2,132,136])assert(!fs.existsSync(path.join(dir,`usage-${n}.json`)));
 for(const kind of ['wrong-scenario','third-turn','fifth-call','before-turn','second-instance','expired','tampered','transport','usage','incomplete']){
  const d=seed(kind);claim(d,now());let count=0;
  if(kind==='tampered'){const p=path.join(d,'critical-recheck239-started.json'),m=JSON.parse(fs.readFileSync(p,'utf8'));m.maxNewCalls=25;fs.writeFileSync(p,JSON.stringify(m));assert.throws(()=>allowance({},d,now),/CLAIM_MISMATCH/);continue}
  const x=allowance({responses:{create:async()=>{count++;if(kind==='transport')throw Object.assign(Error('DO_NOT_PERSIST'),{code:'HTTP_401'});if(kind==='usage')return{...response(),usage:null};if(kind==='incomplete')return{...response(),status:'incomplete'};return response()}}},d,kind==='expired'?()=>POLICY.validUntil:now);
  if(kind==='wrong-scenario'){assert.throws(()=>x.beginScenario('unknown'),/SCENARIO_LIMIT/);continue}
  if(kind==='expired'){assert.throws(()=>x.beginScenario(POLICY.scenarioIds[0]),/SESSION_EXPIRED/);assert(!fs.existsSync(path.join(d,'attempt-240.json')));continue}
  if(kind==='second-instance'){assert.throws(()=>allowance({},d,now),/EEXIST/);continue}
  x.beginScenario(POLICY.scenarioIds[0]);
  if(kind==='before-turn'){await assert.rejects(()=>x.provider.create(body(),signal()));assert.equal(count,0);continue}
  x.beginTurn();
  if(kind==='fifth-call'){for(let n=0;n<4;n++)await x.provider.create(body(),signal());await assert.rejects(()=>x.provider.create(body(),signal()));assert.equal(count,4);continue}
  if(kind==='third-turn'){x.beginTurn();assert.throws(()=>x.beginTurn(),/SCENARIO_LIMIT/);continue}
  await assert.rejects(()=>x.provider.create(body(),signal()));await assert.rejects(()=>x.provider.create(body(),signal()));assert.equal(count,1);assert(x.closed);assert.equal(x.counts().reservedNano,4434144000);assert(!fs.existsSync(path.join(d,'usage-240.json')));assert(!fs.readFileSync(path.join(d,'failure-240.json'),'utf8').includes('DO_NOT_PERSIST'));
 }
 const expiry=seed('expiry-check');assert.throws(()=>check(expiry,POLICY.validUntil),/PRICE_OR_ISOLATION/);assert.equal(new Date(POLICY.validUntil).toISOString(),'2026-10-17T18:59:59.000Z');
 const runnerDir=seed('runner'),output=path.join(root,'output');fs.mkdirSync(output);claim(runnerDir,now());const running=allowance({responses:{create:async()=>{throw Error('NO_MODEL_NEEDED')}}},runnerDir,now);
 const fake={cases:[{id:'colour-cheaper',prompts:['a','b'],expect:{}},{id:'saved-products',prompts:['c','d'],expect:{saved:true}}],async runCase(spec,budget,out){budget.beginTurn();budget.beginTurn();const d=path.join(out,spec.id);fs.mkdirSync(d);for(let n=1;n<=2;n++)fs.writeFileSync(path.join(d,`turn-${n}.json`),JSON.stringify({reply:{message:'Не удалось надёжно проверить ответ.',cards:[],context:{}}}));return{id:spec.id,status:'REVIEW_REQUIRED',taskStatus:'REVIEW_REQUIRED',safetyStatus:'CHECKS_PASS',completedTurns:2}}};
 const adapter=require('./lib/assistant-critical-runner.cjs').restrictedSuite(fake),specs=specifications(fake);await assert.rejects(()=>adapter.runCase({...specs[0],prompts:['different','b']},running,output),/SCENARIO_LIMIT/);
 const result=await require('./lib/assistant-repeat-runner.cjs').runCases(running,specs,adapter,output);assert.equal(result.status,'EVALUATION_COMPLETED');assert.equal(result.failed,3);assert.equal(result.passed,0);assert.equal(result.totalCalls,239);
 const ps=fs.readFileSync(path.join(__dirname,'assistant-critical-live.ps1'),'utf8'),old=fs.readFileSync(path.join(__dirname,'assistant-repeat-16.ps1'),'utf8');const pipe=s=>s.slice(s.indexOf('        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)'),s.indexOf('        if (!$child.WaitForExit(',s.indexOf('        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)')));assert.equal(pipe(ps),pipe(old));for(const token of ['$info.Environment.Clear()','-AsSecureString','ZeroFreeBSTR','if ($CheckOnly)','$child.Kill($true)'])assert(ps.includes(token));assert.equal((ps.match(/-AsSecureString/g)||[]).length,1);
 assert.equal(network,0);console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:network,priorAttemptsPreserved:239,maxNewCalls:24,maxTotalCalls:263,maxReserveUsd:4.8590828,expiry:'2026-10-17T18:59:59Z',checks:['readiness-no-claim','exclusive-claim','exclusive-executor','scenario-order','changed-prompts-rejected','two-turn-limit','four-calls-per-turn','25th-call-blocked','reserve-before-transport','unknown-reserves-kept','no-retry','expiry','tampered-claim-rejected','review-failure-not-pass','same-masked-key-pipe']}));
})().catch(e=>{console.error(e);process.exitCode=1});
