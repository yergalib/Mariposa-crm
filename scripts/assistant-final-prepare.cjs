// Read-only preflight: no transport, credentials, claims or ledger writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const FINGERPRINT='ae1e495ebf233556320c31cb29b353afd35a8ee3bb5b7a68d597259c8df0bda8';
function prepare(dir){
 const names=fs.readdirSync(dir),attempts=names.filter(n=>/^attempt-\d+\.json$/.test(n)).map(n=>Number(n.match(/\d+/)[0])).sort((a,b)=>a-b);
 if(attempts.length!==252||attempts.some((n,i)=>n!==i+1))throw Error('LEDGER_CHANGED');
 for(const n of attempts){const a=JSON.parse(fs.readFileSync(path.join(dir,`attempt-${n}.json`),'utf8'));if(a.attempt!==n||a.reservedNano!==n*18475600)throw Error('LEDGER_MISMATCH')}
 const hash=crypto.createHash('sha256');for(const name of names.filter(n=>/^(?:attempt|usage|failure)-\d+\.json$/.test(n)).sort()){hash.update(name);hash.update(fs.readFileSync(path.join(dir,name)))}
 const fingerprint=hash.digest('hex');if(fingerprint!==FINGERPRINT)throw Error('LEDGER_MISMATCH');
 const previous=JSON.parse(fs.readFileSync(path.join(dir,'critical-recheck239/result.json'),'utf8'));
 if(previous.status!=='EVALUATION_COMPLETED'||previous.totalCalls!==252||previous.reservedNano!==4655851200)throw Error('LEDGER_MISMATCH');
 return{priorAttempts:252,priorReservedUsd:4.6558512,maxNewCalls:18,additionalReserveUsd:0.3325608,maxAggregateReserveUsd:4.988412,unreservedAfterMaximumUsd:0.011588,ledgerFingerprint:fingerprint,unknownAttempts:[1,2,132,136]};
}
function specifications(suite){
 const find=id=>{const s=suite.cases.find(c=>c.id===id);if(!s)throw Error('SCENARIO_MISSING');return structuredClone(s)};
 const combined=find('size-and-colour');combined.id='size-colour-empty';combined.prompts=[combined.prompts[1],'Бюджет стал меньше. Подбери дешевле по тому же размеру, цвету и датам.'];combined.expect={size:'146',colour:'Синий',modes:['normal','empty'],noCards:true};
 return[combined,find('recover-tool-error'),find('negative-then-positive')];
}
module.exports={prepare,specifications,FINGERPRINT};
