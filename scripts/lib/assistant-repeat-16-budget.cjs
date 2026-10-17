// Authorized continuation of the SAME $5 total; never resets the old ledger.
const fs=require('node:fs'),path=require('node:path');
const {POLICY:SMALL,snapshot,usage}=require('./assistant-small-smoke.cjs');
const POLICY=Object.freeze({approval:'Sentinel_332537c518588191842f486f58707087',totalNano:5000000000,priorCount:136,priorNano:2512681600,maxNewCalls:128,mainCalls:128,maxTurns:32,maxPerTurn:4,maxOutput:1400,reserveNano:SMALL.reserveNano,validUntil:Date.parse('2026-10-17T23:59:59+05:00'),maxTotalNano:4877558400});
function check(dir,now=Date.now()){
 if(process.env.VERCEL||process.env.VERCEL_ENV||now>=POLICY.validUntil)throw Error('PRICE_OR_ISOLATION');
 const previous=JSON.parse(fs.readFileSync(path.join(dir,'evaluation-repeat-16-resume132/result.json'),'utf8'));if(previous.status!=='STOPPED'||previous.totalCalls!==136||previous.reservedNano!==POLICY.priorNano)throw Error('PREVIOUS_RUN_NOT_COMPLETE');
 const names=fs.readdirSync(dir);if(names.includes('evaluation-repeat-16-resume136-started.json')||names.some(n=>/^attempt-\d+\.json$/.test(n)&&Number(n.match(/\d+/)[0])>136))throw Error('EVALUATION_ALREADY_USED');
 const start=JSON.parse(fs.readFileSync(path.join(dir,'started.json'),'utf8'));if(start.approval!==SMALL.approval)throw Error('LEDGER_MISMATCH');
 for(let i=1;i<=136;i++){const a=JSON.parse(fs.readFileSync(path.join(dir,`attempt-${i}.json`),'utf8'));if(a.attempt!==i||a.reservedNano!==i*SMALL.reserveNano)throw Error('LEDGER_MISMATCH')}
 if(POLICY.priorNano+POLICY.maxNewCalls*POLICY.reserveNano!==POLICY.maxTotalNano||POLICY.maxTotalNano>POLICY.totalNano)throw Error('BUDGET_MATH');
}
function claim(dir,now=Date.now()){
 check(dir,now);const fd=fs.openSync(path.join(dir,'evaluation-repeat-16-resume136-started.json'),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({...POLICY,expiresAt:Math.min(now+2*3600000,POLICY.validUntil)}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
function allowance(transport,dir,now=()=>Date.now()){
 let calls=0,turns=0,inTurn=0,busy=false,closed=false,stopReason=null;const marker=JSON.parse(fs.readFileSync(path.join(dir,'evaluation-repeat-16-resume136-started.json'),'utf8'));if(marker.approval!==POLICY.approval||marker.priorCount!==136||marker.priorNano!==POLICY.priorNano)throw Error('CLAIM_MISMATCH');const deadline=marker.expiresAt;if(!Number.isSafeInteger(deadline)||deadline>POLICY.validUntil||deadline>now()+2*3600000)throw Error('CLAIM_EXPIRY');
 const stop=reason=>{closed=true;stopReason??=reason;throw Error(reason)};
 const valid=()=>{if(closed)throw Error(stopReason);if(now()>=deadline)stop('SESSION_EXPIRED')};
 const counts=()=>({newCalls:calls,totalCalls:136+calls,reservedNano:POLICY.priorNano+calls*POLICY.reserveNano});
 return{get closed(){return closed},get stopReason(){return stopReason},counts,beginTurn(){valid();if(busy||++turns>POLICY.maxTurns){stop('TURN_LIMIT')}inTurn=0},provider:{async create(raw,signal){
  valid();if(busy||signal.aborted||!turns||inTurn>=4||calls>=128)stop('CALL_OR_TURN_LIMIT');let body;try{body=snapshot(raw)}catch{stop('REQUEST_POLICY_LIMIT')}
  if(POLICY.priorNano+(calls+1)*POLICY.reserveNano>POLICY.totalNano)stop('BUDGET_LIMIT');
  busy=true;calls++;inTurn++;const attempt=136+calls;let stage='DEBIT',observed=null;
  try{
   const fd=fs.openSync(path.join(dir,`attempt-${attempt}.json`),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({approval:POLICY.approval,attempt,turn:turns,...counts(),payloadBytes:Buffer.byteLength(JSON.stringify(body))}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
   valid();if(signal.aborted)throw Error('ABORTED');stage='TRANSPORT';const r=await transport.responses.create(body,{signal:AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,deadline-now()))]),maxRetries:0,timeout:90000});stage='USAGE';
   const n=v=>Number.isSafeInteger(v)&&v>=0?v:null;observed={responseStatus:['completed','incomplete','failed','cancelled','queued','in_progress'].includes(r?.status)?r.status:'unknown',incompleteReason:['max_output_tokens','content_filter'].includes(r?.incomplete_details?.reason)?r.incomplete_details.reason:null,completed:r?.status==='completed',modelMatches:r?.model===SMALL.model,tierMatches:r?.service_tier==='default',input:n(r?.usage?.input_tokens),output:n(r?.usage?.output_tokens)};
   valid();const u=usage(r,body.max_output_tokens);fs.writeFileSync(path.join(dir,`usage-${attempt}.json`),JSON.stringify(u),{flag:'wx',mode:0o600});
   return{status:r.status,output:r.output,outputText:r.output_text,outputTokens:u.output_tokens};
  }catch(error){closed=true;const transportCode=['EVALUATION_TIMEOUT','EVALUATION_ABORTED','EVALUATION_TRANSPORT_ERROR','EVALUATION_RESPONSE_ERROR','EVALUATION_RESPONSE_INVALID','EVALUATION_RESPONSE_TOO_LARGE','HTTP_401','HTTP_429','HTTP_5XX','HTTP_ERROR'].includes(error?.code)?error.code:null;stopReason??=(now()>=deadline?'SESSION_EXPIRED':transportCode)??(stage==='USAGE'?(observed?.completed?'INVALID_USAGE':'INCOMPLETE_OUTPUT'):stage==='TRANSPORT'?'HTTP_OR_TRANSPORT_FAILURE':'RESERVATION_FAILURE');try{fs.writeFileSync(path.join(dir,`failure-${attempt}.json`),JSON.stringify({stage,reason:stopReason,observed,noRetry:true}),{flag:'wx',mode:0o600})}catch{}throw Error('EVALUATION_STOPPED_NO_RETRY')}finally{busy=false}
 }}};
}
module.exports={POLICY,check,claim,allowance};
