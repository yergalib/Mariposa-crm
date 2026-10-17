const fs=require('node:fs'),path=require('node:path');
const {POLICY,check,claim,allowance}=require('./lib/assistant-critical-budget.cjs');
const {makeEvaluationTransport}=require('./lib/assistant-evaluation-transport.cjs'),{transportReport}=require('./assistant-small-smoke.cjs'),{diagnosticRequest}=require('./lib/assistant-http-diagnostic.cjs');
const ledger=path.resolve(__dirname,'../../assistant-smoke-approval-20261016-144953'),evidence=path.join(ledger,'critical-recheck239');
function usageSummary(totalCalls){const sum={inputTokens:0,outputTokens:0,cachedTokens:0,cacheWriteTokens:0,estimatedNanoWithMargin:0,unknownAttempts:[]};for(let i=1;i<=totalCalls;i++){const file=path.join(ledger,`usage-${i}.json`);if(!fs.existsSync(file)){sum.unknownAttempts.push(i);continue}const u=JSON.parse(fs.readFileSync(file,'utf8'));sum.inputTokens+=u.input_tokens;sum.outputTokens+=u.output_tokens;sum.cachedTokens+=u.cached_tokens;sum.cacheWriteTokens+=u.cache_write_tokens;sum.estimatedNanoWithMargin+=u.estimatedNano}return sum}
async function readKey(){const chunks=[];let size=0;try{for await(const chunk of process.stdin){size+=chunk.length;if(size>512)throw Error('KEY_LENGTH');chunks.push(chunk)}return Buffer.concat(chunks)}finally{for(const c of chunks)c.fill(0)}}
async function main(){
 check(ledger);const suite=require('./assistant-evaluation-suite.cjs');const specs=require('./assistant-critical-recheck.cjs').specifications(suite);if(JSON.stringify(specs.map(s=>s.id))!==JSON.stringify(POLICY.scenarioIds)||specs.some(s=>s.prompts.length!==2))throw Error('SCENARIOS');
 if(process.argv[2]==='--check'){console.log('READY');return}if(process.argv[2]!=='--live')throw Error('MODE');
 claim(ledger);fs.mkdirSync(evidence,{recursive:true});let key,transport,a;
 try{
  key=await readKey();if(!/^sk-[A-Za-z0-9_-]{20,500}$/.test(key.toString('ascii')))throw Error('KEY_FORMAT');
  const observedRequest=require('./lib/assistant-transport-diagnostic.cjs').observeTransport(require('node:https').request,data=>fs.writeFileSync(path.join(evidence,`transport-failure-${a?.counts().totalCalls??239}.json`),JSON.stringify(data),{flag:'wx',mode:0o600}));
  const request=diagnosticRequest(observedRequest,data=>fs.writeFileSync(path.join(evidence,`http-error-${a?.counts().totalCalls??239}.json`),JSON.stringify(data),{flag:'wx',mode:0o600}));
  transport=makeEvaluationTransport(key,request,transportReport(evidence));a=allowance(transport,ledger);
  const result=await require('./lib/assistant-repeat-runner.cjs').runCases(a,specs,require('./lib/assistant-critical-runner.cjs').restrictedSuite(suite),evidence);result.reservedTokenUsd=result.reservedNano/1e9;result.totalBudgetUsd=5;result.unreservedUsd=(POLICY.totalNano-result.reservedNano)/1e9;result.usage=usageSummary(result.totalCalls);if(result.status==='STOPPED')result.code='EVALUATION_STOPPED';
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(result.status!=='EVALUATION_COMPLETED')process.exitCode=2;
 }catch{const counts=a?.counts()??{newCalls:0,totalCalls:239,reservedNano:POLICY.priorNano};const result={status:'STOPPED',code:'EVALUATION_STOPPED',stopReason:a?.stopReason??'LOCAL_RUN_FAILURE',...counts,reservedTokenUsd:counts.reservedNano/1e9,noRetry:true};fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result));console.log(JSON.stringify(result));process.exitCode=2}
 finally{key?.fill(0);transport?.dispose()}
}
if(require.main===module){const timer=setTimeout(()=>process.exit(3),7220000);main().catch(error=>{console.log(JSON.stringify({status:'STOPPED_BEFORE_KEY',code:['PRICE_OR_ISOLATION','APPROVAL_ALREADY_USED','LEDGER_CHANGED','LEDGER_MISMATCH'].includes(error?.message)?error.message:'READINESS_FAILED'}));process.exitCode=2}).finally(()=>{clearTimeout(timer);process.stdin.destroy()})}
