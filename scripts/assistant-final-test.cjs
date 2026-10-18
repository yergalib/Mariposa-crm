const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let network=0;for(const name of ['node:http','node:https'])require(name).request=()=>{network++;throw Error('NETWORK_FORBIDDEN')};global.fetch=()=>{network++;throw Error('NETWORK_FORBIDDEN')};
const {POLICY,check,claim,allowance}=require('./lib/assistant-final-budget.cjs');
const {prepare,specifications,FINGERPRINT}=require('./assistant-final-prepare.cjs');
const {body,response}=require('./assistant-small-smoke-test.cjs');
const real=path.resolve(__dirname,'../../assistant-smoke-approval-20261016-144953');
const before=prepare(real);assert.equal(before.ledgerFingerprint,FINGERPRINT);
const baseline=fs.readdirSync(real).filter(n=>/^(attempt|usage|failure)-\d+\.json$/.test(n)||n==='started.json').map(n=>[n,fs.readFileSync(path.join(real,n))]);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-final-offline-')),now=()=>Date.parse('2026-10-18T12:00:00Z');
function seed(name){const d=path.join(root,name);fs.mkdirSync(d);for(const [n,b] of baseline)fs.writeFileSync(path.join(d,n),b);fs.mkdirSync(path.join(d,'critical-recheck239'));fs.copyFileSync(path.join(real,'critical-recheck239/result.json'),path.join(d,'critical-recheck239/result.json'));return d}
const signal=()=>new AbortController().signal;
const fakeSuite={cases:[{id:'size-and-colour',prompts:['base','Размер 146 и синее платье, даты прежние.'],expect:{}},{id:'recover-tool-error',prompts:['fail','recover'],expect:{}},{id:'negative-then-positive',prompts:['exclude','blue'],expect:{}}]};
(async()=>{
 assert.equal(Math.ceil((128768*125+1400*500)*1.1),POLICY.reserveNano);
 assert.equal(Math.floor((POLICY.totalNano-POLICY.priorNano)/POLICY.reserveNano),18);
 const d=seed('maximum');check(d,now());assert(!fs.existsSync(path.join(d,'final252-started.json')));claim(d,now());assert.throws(()=>claim(d,now()),/APPROVAL_ALREADY_USED/);
 let calls=0;const a=allowance({responses:{create:async(_,opts)=>{calls++;assert.equal(opts.maxRetries,0);assert(fs.existsSync(path.join(d,`attempt-${252+calls}.json`)));return response()}}},d,now);
 assert.throws(()=>allowance({},d,now),/EEXIST/);
 const specs=specifications(fakeSuite),evidence=path.join(root,'scorecard');fs.mkdirSync(evidence);
 const suite={...fakeSuite,async runCase(spec,budget){let completedTurns=0;try{for(let t=0;t<2;t++){budget.beginTurn();for(let i=0;i<4;i++)await budget.provider.create(body(),signal());completedTurns++}}catch{return{id:spec.id,status:'FAIL',taskStatus:'FAIL',completedTurns}}return{id:spec.id,status:'PASS',taskStatus:'PASS',completedTurns}}};
 const result=await require('./lib/assistant-final-runner.cjs').runCases(a,specs,suite,evidence);
 assert.equal(calls,18);assert.equal(result.totalCalls,270);assert.equal(result.reservedNano,4988412000);assert.equal(result.status,'STOPPED');assert.equal(result.pending,1);assert.equal(result.passed,0);assert.equal(result.reviewRequired,2);assert.equal(result.comparison.liveAfterLatestFix,'NOT_RERUN');assert(!fs.existsSync(path.join(d,'attempt-271.json')));
 const card=JSON.parse(fs.readFileSync(path.join(evidence,'scorecard.json')));assert.equal(card.results[2].taskStatus,'PENDING');assert.equal(card.results[2].completedTurns,0);
 for(const [n,b] of baseline)assert(fs.readFileSync(path.join(d,n)).equals(b),'old ledger byte integrity');
 for(const kind of ['wrong-scenario','fifth-call','third-turn','before-turn','expired','tampered-claim','tampered-ledger','transport','usage','incomplete','bad-payload']){
  const dir=seed(kind);claim(dir,now());let count=0;
  if(kind==='tampered-claim'){const p=path.join(dir,'final252-started.json'),m=JSON.parse(fs.readFileSync(p));m.maxNewCalls=19;fs.writeFileSync(p,JSON.stringify(m));assert.throws(()=>allowance({},dir,now),/CLAIM_MISMATCH/);continue}
  if(kind==='tampered-ledger'){fs.appendFileSync(path.join(dir,'usage-252.json'),' ');assert.throws(()=>allowance({},dir,now),/LEDGER_MISMATCH/);continue}
  const b=allowance({responses:{create:async()=>{count++;if(kind==='transport')throw Object.assign(Error('PRIVATE_ERROR_NOT_LOGGED'),{code:'HTTP_401'});if(kind==='usage')return{...response(),usage:null};if(kind==='incomplete')return{...response(),status:'incomplete'};return response()}}},dir,kind==='expired'?()=>POLICY.validUntil:now);
  if(kind==='wrong-scenario'){assert.throws(()=>b.beginScenario('saved-products'),/SCENARIO_LIMIT/);continue}
  if(kind==='expired'){assert.throws(()=>b.beginScenario(POLICY.scenarioIds[0]),/SESSION_EXPIRED/);continue}
  b.beginScenario(POLICY.scenarioIds[0]);
  if(kind==='before-turn'){await assert.rejects(()=>b.provider.create(body(),signal()));assert.equal(count,0);continue}
  b.beginTurn();
  if(kind==='third-turn'){b.beginTurn();assert.throws(()=>b.beginTurn(),/SCENARIO_LIMIT/);continue}
  if(kind==='fifth-call'){for(let i=0;i<4;i++)await b.provider.create(body(),signal());await assert.rejects(()=>b.provider.create(body(),signal()));assert.equal(count,4);continue}
  if(kind==='bad-payload'){await assert.rejects(()=>b.provider.create({...body(),model:'other'},signal()));assert.equal(count,0);assert(!fs.existsSync(path.join(dir,'attempt-253.json')));continue}
  await assert.rejects(()=>b.provider.create(body(),signal()));await assert.rejects(()=>b.provider.create(body(),signal()));assert.equal(count,1);assert.equal(b.counts().reservedNano,4674326800);assert(!fs.existsSync(path.join(dir,'usage-253.json')));assert(!fs.readFileSync(path.join(dir,'failure-253.json'),'utf8').includes('PRIVATE_ERROR_NOT_LOGGED'));
 }
 assert.throws(()=>check(seed('price-expiry'),POLICY.validUntil),/PRICE_OR_ISOLATION/);
 const completeDir=seed('complete'),completeOut=path.join(root,'complete-out');fs.mkdirSync(completeOut);claim(completeDir,now());const completeBudget=allowance({responses:{create:async()=>response()}},completeDir,now);
 const shortSuite={...fakeSuite,async runCase(spec,b){for(let t=0;t<2;t++){b.beginTurn();await b.provider.create(body(),signal())}return{id:spec.id,status:'PASS',taskStatus:'PASS',completedTurns:2}}};
 const done=await require('./lib/assistant-final-runner.cjs').runCases(completeBudget,specs,shortSuite,completeOut);assert.equal(done.status,'EVALUATION_COMPLETED');assert.equal(done.passed,0);assert.equal(done.reviewRequired,3);assert.equal(done.pending,0);
 const ps=fs.readFileSync(path.join(__dirname,'assistant-final-live.ps1'),'utf8'),old=fs.readFileSync(path.join(__dirname,'assistant-critical-live.ps1'),'utf8');const pipe=s=>s.slice(s.indexOf('        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)'),s.indexOf('        if (!$child.WaitForExit(',s.indexOf('        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)')));assert.equal(pipe(ps),pipe(old));for(const s of ['$info.Environment.Clear()','-AsSecureString','ZeroFreeBSTR','if ($CheckOnly)','$child.Kill($true)'])assert(ps.includes(s));assert.equal((ps.match(/-AsSecureString/g)||[]).length,1);
 assert.deepEqual(prepare(real),before);assert.equal(network,0);
 console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,secretReads:0,realLedgerUnchanged:true,firstAttempt:253,maxNewCalls:18,maxTotalCalls:270,maxAggregateReserveUsd:4.988412,unknownReservesRetained:[1,2,132,136],checks:['exact-252-ledger-fingerprint','reserve-before-send','19th-new-call-blocked','one-use-claim','exclusive-executor','expiry','scenario-order','per-turn-limit','malformed-payload','transport-usage-incomplete-no-retry','tamper-rejection','pending-on-budget-stop','no-automatic-PASS','same-private-key-pipe'],syntheticEvidence:root}));
})().catch(e=>{console.error(e);process.exitCode=1});
