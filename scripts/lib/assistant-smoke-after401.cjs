const fs=require('node:fs'),path=require('node:path'),{POLICY}=require('./assistant-small-smoke.cjs');
const options=Object.freeze({initialCount:2,maxCalls:10,maxTurns:2});
function checkAfter401(dir,now=Date.now()){
 if(process.env.VERCEL||process.env.VERCEL_ENV||now>=POLICY.validUntil)throw Error('ISOLATION_OR_PRICE');
 const names=fs.readdirSync(dir),read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
 if(names.includes('resume-after401-started.json')||names.some(n=>/^attempt-\d+\.json$/.test(n)&&!['attempt-1.json','attempt-2.json'].includes(n)))throw Error('RESUME_ALREADY_USED_OR_UNEXPECTED_HISTORY');
 const start=read('started.json'),first=read('resume-started.json'),r=read('resume-evidence/result.json'),http=read('resume-evidence/transport.json');
 if(start.approval!==POLICY.approval||start.budgetNano!==POLICY.budgetNano||first.approval!==POLICY.approval||first.priorReservedNano!==POLICY.reserveNano||r.status!=='STOPPED'||r.attempts!==2||r.reservedTokenUsd!==2*POLICY.reserveNano/1e9||!http.some(e=>e.stage==='HTTP_STATUS'&&e.status===401))throw Error('LEDGER_MISMATCH');
 for(let i=1;i<=2;i++){const a=read(`attempt-${i}.json`);if(a.attempt!==i||a.reservedNano!==i*POLICY.reserveNano)throw Error('LEDGER_MISMATCH')}
 return options;
}
function claimAfter401(dir,now=Date.now()){
 checkAfter401(dir,now);const fd=fs.openSync(path.join(dir,'resume-after401-started.json'),'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify({approval:POLICY.approval,priorReservedNano:36951200,remainingBudgetNano:213048800,totalBudgetNano:POLICY.budgetNano,maxAdditionalCalls:8,maxCustomerTurns:2,expiresAt:Math.min(now+900000,POLICY.validUntil)}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}return options;
}
module.exports={checkAfter401,claimAfter401};
