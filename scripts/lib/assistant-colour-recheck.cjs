const fs=require('node:fs'),path=require('node:path'),{POLICY}=require('./assistant-small-smoke.cjs');
const options=Object.freeze({initialCount:9,maxCalls:13,maxTurns:1});
function checkColour(dir,now=Date.now()){
 if(process.env.VERCEL||process.env.VERCEL_ENV||now>=POLICY.validUntil)throw Error('ISOLATION_OR_PRICE');
 const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8')),names=fs.readdirSync(dir);
 if(names.includes('colour-recheck-started.json')||names.some(n=>/^attempt-\d+\.json$/.test(n)&&Number(n.match(/\d+/)[0])>9))throw Error('RESUME_ALREADY_USED_OR_UNEXPECTED_HISTORY');
 const start=read('started.json'),result=read('resume-after401-evidence/result.json');
 if(start.approval!==POLICY.approval||start.budgetNano!==POLICY.budgetNano||result.status!=='LIVE_COMPLETED'||result.attempts!==9||result.reservedTokenUsd!==9*POLICY.reserveNano/1e9)throw Error('LEDGER_MISMATCH');
 for(let i=1;i<=9;i++){const a=read(`attempt-${i}.json`);if(a.attempt!==i||a.reservedNano!==i*POLICY.reserveNano)throw Error('LEDGER_MISMATCH')}
 if(13*POLICY.reserveNano>POLICY.budgetNano)throw Error('LEDGER_MISMATCH');return options;
}
function claimColour(dir,now=Date.now()){
 checkColour(dir,now);const fd=fs.openSync(path.join(dir,'colour-recheck-started.json'),'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify({approval:POLICY.approval,priorReservedNano:166280400,maxAdditionalCalls:4,maxAdditionalReserveNano:73902400,maxTotalReserveNano:240182800,totalBudgetNano:POLICY.budgetNano,expiresAt:Math.min(now+900000,POLICY.validUntil)}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}return options;
}
module.exports={checkColour,claimColour};
