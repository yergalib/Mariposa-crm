const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let network=0;for(const n of ['node:http','node:https'])require(n).request=()=>{network++;throw Error('NETWORK_FORBIDDEN')};global.fetch=()=>{network++;throw Error('NETWORK_FORBIDDEN')};
const {POLICY,check,claim,allowance}=require('./lib/assistant-close-budget.cjs'),{prepare,specifications}=require('./assistant-close-prepare.cjs'),{body,response}=require('./assistant-small-smoke-test.cjs');
const real=path.resolve(__dirname,'../../assistant-smoke-approval-20261016-144953'),before=prepare(real),root=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-close-offline-'));
const baseline=fs.readdirSync(real).filter(n=>/^(attempt|usage|failure)-\d+\.json$/.test(n)||n==='started.json').map(n=>[n,fs.readFileSync(path.join(real,n))]);
const now=()=>Date.parse('2026-10-18T16:00:00Z'),signal=()=>new AbortController().signal;
function seed(name){const d=path.join(root,name);fs.mkdirSync(d);for(const [n,b]of baseline)fs.writeFileSync(path.join(d,n),b);fs.mkdirSync(path.join(d,'final252'));fs.copyFileSync(path.join(real,'final252/result.json'),path.join(d,'final252/result.json'));return d}
(async()=>{
 assert.equal(POLICY.totalNano,6000000000);assert.equal(POLICY.priorNano,4988412000);assert.equal(POLICY.maxNewCalls,16);assert.equal(POLICY.maxTurns,4);assert.equal(POLICY.maxTotalNano,5284021600);
 const d=seed('cap');check(d,now());assert(!fs.existsSync(path.join(d,'close270-started.json')));claim(d,now());assert.throws(()=>claim(d,now()),/APPROVAL_ALREADY_USED/);
 let calls=0;const a=allowance({responses:{create:async(_,o)=>{assert.equal(o.maxRetries,0);calls++;assert(fs.existsSync(path.join(d,`attempt-${270+calls}.json`)));return response()}}},d,now);
 assert.throws(()=>allowance({},d,now),/EEXIST/);
 for(const id of POLICY.scenarioIds){a.beginScenario(id);for(let t=0;t<2;t++){a.beginTurn();for(let i=0;i<4;i++)await a.provider.create(body(),signal())}}
 await assert.rejects(()=>a.provider.create(body(),signal()));assert.equal(calls,16);assert.equal(a.counts().totalCalls,286);assert.equal(a.counts().reservedNano,5284021600);assert(!fs.existsSync(path.join(d,'attempt-287.json')));
 for(const [n,b]of baseline)assert(fs.readFileSync(path.join(d,n)).equals(b));
 const fake={cases:[{id:'negative-then-positive',prompts:['a','b'],expect:{}},{id:'saved-products',prompts:['c','d'],expect:{saved:true}}],async runCase(spec,b){b.beginTurn();await b.provider.create(body(),signal());return{id:spec.id,completedTurns:2,taskStatus:'PASS'}}};
 const dir=seed('error'),out=path.join(root,'out');fs.mkdirSync(out);claim(dir,now());let attempts=0;const bad=allowance({responses:{create:async()=>{attempts++;throw Object.assign(Error('secret-must-not-persist'),{code:'HTTP_401'})}}},dir,now);
 const r=await require('./lib/assistant-close-runner.cjs').runCases(bad,specifications(fake),fake,out);assert.equal(r.status,'STOPPED');assert.equal(r.pending,2);assert.equal(r.passed,0);assert.equal(attempts,1);assert.equal(r.reservedNano,5006887600);await assert.rejects(()=>bad.provider.create(body(),signal()));assert.equal(attempts,1);assert(!fs.readFileSync(path.join(dir,'failure-271.json'),'utf8').includes('secret-must-not-persist'));
 const tamper=seed('tamper');fs.appendFileSync(path.join(tamper,'usage-270.json'),' ');assert.throws(()=>check(tamper,now()),/LEDGER_MISMATCH/);
 assert.throws(()=>check(seed('expired'),POLICY.validUntil),/PRICE_OR_ISOLATION/);
 const ps=fs.readFileSync(path.join(__dirname,'assistant-close-live.ps1'),'utf8'),old=fs.readFileSync(path.join(__dirname,'assistant-final-live.ps1'),'utf8');const pipe=s=>s.slice(s.indexOf('        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)'),s.indexOf('        if (!$child.WaitForExit(',s.indexOf('        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)')));assert.equal(pipe(ps),pipe(old));assert(ps.includes('-AsSecureString'));assert(ps.includes('$info.Environment.Clear()'));
 assert.deepEqual(prepare(real),before);assert.equal(network,0);console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,secretReads:0,realLedgerUnchanged:true,priorAttempts:270,firstAttempt:271,maxNewCalls:16,maxTotalReserveUsd:5.2840216,totalCeilingUsd:6,pendingOnStop:true,noRetries:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
