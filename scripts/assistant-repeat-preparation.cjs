// Preparation only. No transport import, stdin/key prompt, ledger claim or write.
const fs=require('node:fs'),path=require('node:path');
const scenarioIds=['colour-cheaper','colour-replacement','size-correction','date-correction','size-and-colour','empty-catalog','saved-products','human-handoff','booking-not-confirmed','tool-injection','recover-tool-error','unknown-price','comfort-unknown','budget-change','negative-then-positive','unknown-hours'];
function prepare(ledger){
 const attempts=fs.readdirSync(ledger).filter(n=>/^attempt-\d+\.json$/.test(n)).map(n=>Number(n.match(/\d+/)[0])).sort((a,b)=>a-b);
 const reserveNano=18475600,totalBudgetNano=5000000000;
 if(!attempts.length||attempts.some((n,i)=>n!==i+1))throw Error('NONCONTIGUOUS_LEDGER');
 for(const n of attempts){const r=JSON.parse(fs.readFileSync(path.join(ledger,`attempt-${n}.json`),'utf8'));if(r.attempt!==n||r.reservedNano!==n*reserveNano)throw Error('LEDGER_MISMATCH')}
 const last=attempts.at(-1),priorNano=last*reserveNano,maxCalls=scenarioIds.length*2*4,maxTotalNano=priorNano+maxCalls*reserveNano;
 if(maxTotalNano>totalBudgetNano)throw Error('INSUFFICIENT_UNRESERVED_BUDGET');
 const unknownAttempts=attempts.filter(n=>!fs.existsSync(path.join(ledger,`usage-${n}.json`)));
 return {status:'PREPARED_NOT_RUN',scenarioIds,priorAttempts:last,priorReservedUsd:priorNano/1e9,unknownAttempts,maxTurns:32,maxCalls,maxCallsPerTurn:4,automaticRechecks:0,additionalReserveUsd:maxCalls*reserveNano/1e9,maxAggregateReserveUsd:maxTotalNano/1e9,totalBudgetUsd:5,unreservedAfterMaximumUsd:(totalBudgetNano-maxTotalNano)/1e9,firstFutureAttempt:last+1,networkCalls:0,ledgerModified:false,executionEnabled:false,requirements:['Revalidate this same ledger immediately before any future run; do not reuse attempt numbers.','Existing completed evaluation claim cannot be reused. Require an authorized valid session and exclusive continuation claim, no automatic retry.','Keep the original expiry and usage validation; do not renew pricing or authorization silently.','Reserve durably before each request; unknown usage keeps its reservation.','Use runCase for exactly these scenarios and the strict safety/task assessment; no automatic rechecks.']};
}
if(require.main===module){const ledger=path.resolve(__dirname,'../../assistant-smoke-approval-20261016-144953'),out=path.resolve(__dirname,'../docs/assistant-repeat-prepared-20261016.json');const report=prepare(ledger);fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
module.exports={prepare};
