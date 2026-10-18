const fs=require('node:fs'),path=require('node:path');
const {specifications}=require('../assistant-final-prepare.cjs');
async function runCases(a,specs,suite,evidence){
 const expected=specifications(suite);if(JSON.stringify(specs)!==JSON.stringify(expected))throw Error('SCENARIO_LIMIT');
 const results=specs.map(s=>({id:s.id,status:'PENDING',taskStatus:'PENDING',safetyStatus:'NOT_EVALUATED',completedTurns:0}));
 let interrupted=false,finished=false;
 const summary=()=>({status:interrupted||a.closed?'STOPPED':finished?'EVALUATION_COMPLETED':'RUNNING',plannedScenarios:specs.length,scenarios:results.filter(r=>r.completedTurns===2).length,pending:results.filter(r=>r.taskStatus==='PENDING').length,passed:0,failed:results.filter(r=>r.taskStatus==='FAIL').length,reviewRequired:results.filter(r=>r.taskStatus==='REVIEW_REQUIRED').length,manualReviewPending:true,stopReason:a.stopReason??(interrupted?'SCENARIO_INTERRUPTED':null),comparison:{api:'PASS_PREVIOUS_CRITICAL3',ui:'PASS_LOCAL',liveAfterLatestFix:'NOT_RERUN'},...a.counts()});
 const save=()=>fs.writeFileSync(path.join(evidence,'scorecard.json'),JSON.stringify({...summary(),results},null,2));save();
 for(let i=0;i<specs.length;i++){
  if(a.closed)break;
  try{
   a.beginScenario(specs[i].id);const r=await suite.runCase(specs[i],a,evidence);
   if(a.closed||r.completedTurns!==2){results[i]={...r,status:'PENDING',taskStatus:'PENDING',safetyStatus:'NOT_FULLY_EVALUATED'};interrupted=true;save();break}
   const verdict=r.taskStatus==='FAIL'?'FAIL':'REVIEW_REQUIRED';results[i]={...r,status:verdict,taskStatus:verdict,manualReviewPending:true};
  }catch{interrupted=true;results[i].failure=a.stopReason??'SCENARIO_INTERRUPTED';save();break}
  save();
 }
 finished=true;save();const result=summary();fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));return result;
}
module.exports={runCases};
