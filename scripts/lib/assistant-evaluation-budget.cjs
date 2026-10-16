// New TOTAL approval includes all earlier reservations; never resets the old ledger.
const fs=require('node:fs'),path=require('node:path');
const {POLICY:SMALL,snapshot,usage}=require('./assistant-small-smoke.cjs');
const POLICY=Object.freeze({approval:'Sentinel_17a23f7c61048191bfb319b259b14b25',totalNano:5000000000,priorCount:12,priorNano:221707200,maxNewCalls:256,mainCalls:192,maxTurns:64,maxPerTurn:4,maxOutput:1400,reserveNano:SMALL.reserveNano,validUntil:SMALL.validUntil,maxTotalNano:4951460800});
function check(dir,now=Date.now()){
 if(process.env.VERCEL||process.env.VERCEL_ENV||now>=POLICY.validUntil)throw Error('PRICE_OR_ISOLATION');
 const names=fs.readdirSync(dir);if(names.includes('evaluation-started.json')||names.some(n=>/^attempt-\d+\.json$/.test(n)&&Number(n.match(/\d+/)[0])>12))throw Error('EVALUATION_ALREADY_USED');
 const start=JSON.parse(fs.readFileSync(path.join(dir,'started.json'),'utf8'));if(start.approval!==SMALL.approval)throw Error('LEDGER_MISMATCH');
 for(let i=1;i<=12;i++){const a=JSON.parse(fs.readFileSync(path.join(dir,`attempt-${i}.json`),'utf8'));if(a.attempt!==i||a.reservedNano!==i*SMALL.reserveNano)throw Error('LEDGER_MISMATCH')}
 if(POLICY.priorNano+POLICY.maxNewCalls*POLICY.reserveNano!==POLICY.maxTotalNano||POLICY.maxTotalNano>POLICY.totalNano)throw Error('BUDGET_MATH');
}
function claim(dir,now=Date.now()){
 check(dir,now);const fd=fs.openSync(path.join(dir,'evaluation-started.json'),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({...POLICY,expiresAt:Math.min(now+2*3600000,POLICY.validUntil)}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
function allowance(transport,dir,now=()=>Date.now()){
 let calls=0,turns=0,inTurn=0,busy=false,closed=false;const deadline=Math.min(now()+2*3600000,POLICY.validUntil);
 const valid=()=>{if(closed||now()>=deadline)throw Error('EVALUATION_CLOSED')};
 const counts=()=>({newCalls:calls,totalCalls:12+calls,reservedNano:POLICY.priorNano+calls*POLICY.reserveNano});
 return{get closed(){return closed},counts,beginTurn(){valid();if(busy||++turns>POLICY.maxTurns){closed=true;throw Error('TURN_LIMIT')}inTurn=0},provider:{async create(raw,signal){
  valid();if(busy||signal.aborted||!turns||inTurn>=4||calls>=256)throw Error('CALL_LIMIT');const body=snapshot(raw);
  if(POLICY.priorNano+(calls+1)*POLICY.reserveNano>POLICY.totalNano)throw Error('BUDGET_LIMIT');
  busy=true;calls++;inTurn++;const attempt=12+calls;let stage='DEBIT',observed=null;
  try{
   const fd=fs.openSync(path.join(dir,`attempt-${attempt}.json`),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({approval:POLICY.approval,attempt,turn:turns,...counts(),payloadBytes:Buffer.byteLength(JSON.stringify(body))}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
   valid();if(signal.aborted)throw Error('ABORTED');stage='TRANSPORT';const r=await transport.responses.create(body,{signal,maxRetries:0,timeout:25000});stage='USAGE';
   const n=v=>Number.isSafeInteger(v)&&v>=0?v:null;observed={completed:r?.status==='completed',modelMatches:r?.model===SMALL.model,tierMatches:r?.service_tier==='default',input:n(r?.usage?.input_tokens),output:n(r?.usage?.output_tokens)};
   valid();const u=usage(r,body.max_output_tokens);fs.writeFileSync(path.join(dir,`usage-${attempt}.json`),JSON.stringify(u),{flag:'wx',mode:0o600});
   return{status:r.status,output:r.output,outputText:r.output_text,outputTokens:u.output_tokens};
  }catch{closed=true;try{fs.writeFileSync(path.join(dir,`failure-${attempt}.json`),JSON.stringify({stage,observed,noRetry:true}),{flag:'wx',mode:0o600})}catch{}throw Error('EVALUATION_STOPPED_NO_RETRY')}finally{busy=false}
 }}};
}
module.exports={POLICY,check,claim,allowance};
