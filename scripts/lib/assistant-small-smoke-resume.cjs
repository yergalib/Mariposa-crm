// One explicit continuation of the known failed first attempt; same approval ledger.
const fs=require('node:fs'),path=require('node:path');
const {POLICY}=require('./assistant-small-smoke.cjs');
const OPTIONS=Object.freeze({initialCount:1,maxTurns:2,maxCalls:9});
function checkResume(dir,now=Date.now()){
 if(process.env.VERCEL||process.env.VERCEL_ENV||now>=POLICY.validUntil)throw Error('ISOLATION_OR_PRICE');
 const names=fs.readdirSync(dir);
 if(names.includes('resume-started.json')||names.some(n=>/^attempt-\d+\.json$/.test(n)&&n!=='attempt-1.json')||names.some(n=>/^turn-\d+\.json$/.test(n)))throw Error('RESUME_ALREADY_USED_OR_UNEXPECTED_HISTORY');
 const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
 const start=read('started.json'),attempt=read('attempt-1.json'),result=read('result.json');
 if(start.approval!==POLICY.approval||start.budgetNano!==POLICY.budgetNano||attempt.attempt!==1||attempt.reservedNano!==POLICY.reserveNano||result.status!=='STOPPED'||result.attempts!==1||result.reservedTokenUsd!==POLICY.reserveNano/1e9||result.noRetry!==true)throw Error('LEDGER_MISMATCH');
 return OPTIONS;
}
function claimResume(dir,now=Date.now()){
 checkResume(dir,now);
 const fd=fs.openSync(path.join(dir,'resume-started.json'),'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify({approval:POLICY.approval,priorReservedNano:POLICY.reserveNano,remainingBudgetNano:POLICY.budgetNano-POLICY.reserveNano,totalBudgetNano:POLICY.budgetNano,maxAdditionalCalls:8,maxCustomerTurns:2,expiresAt:Math.min(now+900000,POLICY.validUntil)}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 return OPTIONS;
}
module.exports={checkResume,claimResume};
