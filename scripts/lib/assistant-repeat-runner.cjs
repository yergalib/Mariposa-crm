const fs=require('node:fs'),path=require('node:path');
async function runCases(a,specs,suite,evidence){
 let finished=false;
 const results=specs.map(s=>({id:s.id,status:'NOT_RUN',taskStatus:'NOT_RUN',safetyStatus:'NOT_EVALUATED',completedTurns:0}));
 const summary=()=>({status:a.closed?'STOPPED':finished?'EVALUATION_COMPLETED':'RUNNING',scenarios:results.filter(r=>r.status!=='NOT_RUN').length,plannedScenarios:specs.length,notRun:results.filter(r=>r.status==='NOT_RUN').length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,reviewRequired:results.filter(r=>r.status==='REVIEW_REQUIRED').length,stopReason:a.stopReason??null,manualReviewPending:true,...a.counts()});
 const save=()=>{fs.writeFileSync(path.join(evidence,'scorecard.json'),JSON.stringify({...summary(),results},null,2));fs.writeFileSync(path.join(evidence,'scorecard.md'),'| Scenario | Task | Safety |\n|---|---|---|\n'+results.map(r=>`| ${r.id} | ${r.taskStatus} | ${r.safetyStatus} |`).join('\n'))};
 save();
 for(let i=0;i<specs.length;i++){
  if(a.closed)break;
  try{results[i]=await suite.runCase(specs[i],a,evidence)}catch{results[i]={id:specs[i].id,status:'FAIL',taskStatus:'FAIL',safetyStatus:'INCOMPLETE_OR_FAIL',failure:a.stopReason??'SCENARIO_INTERRUPTED',completedTurns:0}}
  save();
 }
 finished=true;save();const result=summary();fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));return result;
}
module.exports={runCases};
