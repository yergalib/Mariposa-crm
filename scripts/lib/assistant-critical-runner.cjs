const fs=require('node:fs'),path=require('node:path');
const {POLICY}=require('./assistant-critical-budget.cjs');
const {assessCritical,specifications}=require('../assistant-critical-recheck.cjs');
function restrictedSuite(suite){const expected=specifications(suite);return {async runCase(spec,a,root){
 if(!POLICY.scenarioIds.includes(spec.id)||JSON.stringify(spec)!==JSON.stringify(expected.find(s=>s.id===spec.id)))throw Error('SCENARIO_LIMIT');
 a.beginScenario(spec.id);
 const result=await suite.runCase(spec,a,root),dir=path.join(root,spec.id);
 const turns=[1,2].flatMap(n=>{const file=path.join(dir,`turn-${n}.json`);return fs.existsSync(file)?[JSON.parse(fs.readFileSync(file,'utf8'))]:[]});
 const traceFile=path.join(dir,'trace.json'),trace=fs.existsSync(traceFile)?JSON.parse(fs.readFileSync(traceFile,'utf8')):[];
 const critical=assessCritical(spec.id,turns,trace),taskStatus=result.taskStatus==='FAIL'||critical.taskStatus==='FAIL'?'FAIL':'REVIEW_REQUIRED';
 const assessed={...result,status:taskStatus,taskStatus,criticalChecks:critical.checks,manualReviewPending:true};
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(assessed,null,2));return assessed;
}}}
module.exports={restrictedSuite};
