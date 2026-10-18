// Read-only preflight: no transport, credentials, claims or ledger writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const FINGERPRINT='ffd36888f8d1b0464c3e1ca6671afb6f6b4830f40af3e6a380f088b95d3bd486';
function prepare(dir){
 const names=fs.readdirSync(dir),attempts=names.filter(n=>/^attempt-\d+\.json$/.test(n)).map(n=>Number(n.match(/\d+/)[0])).sort((a,b)=>a-b);
 if(attempts.length!==270||attempts.some((n,i)=>n!==i+1))throw Error('LEDGER_CHANGED');
 for(const n of attempts){const a=JSON.parse(fs.readFileSync(path.join(dir,`attempt-${n}.json`),'utf8'));if(a.attempt!==n||a.reservedNano!==n*18475600)throw Error('LEDGER_MISMATCH')}
 const hash=crypto.createHash('sha256');for(const name of names.filter(n=>/^(?:attempt|usage|failure)-\d+\.json$/.test(n)).sort()){hash.update(name);hash.update(fs.readFileSync(path.join(dir,name)))}
 const fingerprint=hash.digest('hex');if(fingerprint!==FINGERPRINT)throw Error('LEDGER_MISMATCH');
 const previous=JSON.parse(fs.readFileSync(path.join(dir,'final252/result.json'),'utf8'));
 if(previous.status!=='STOPPED'||previous.totalCalls!==270||previous.reservedNano!==4988412000)throw Error('LEDGER_MISMATCH');
 return{priorAttempts:270,priorReservedUsd:4.988412,maxNewCalls:16,additionalReserveUsd:0.2956096,maxAggregateReserveUsd:5.2840216,unreservedAfterMaximumUsd:0.7159784,ledgerFingerprint:fingerprint,unknownAttempts:[1,2,132,136]};
}
function specifications(suite){
 const find=id=>{const s=suite.cases.find(c=>c.id===id);if(!s)throw Error('SCENARIO_MISSING');return structuredClone(s)};
 return[find('negative-then-positive'),find('saved-products')];
}
module.exports={prepare,specifications,FINGERPRINT};
