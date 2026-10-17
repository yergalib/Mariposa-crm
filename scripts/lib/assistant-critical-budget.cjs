// Authorized continuation of the SAME $5 total; never resets the old ledger.
const fs=require('node:fs'),path=require('node:path');
const {POLICY:SMALL,snapshot,usage}=require('./assistant-small-smoke.cjs');
const POLICY=Object.freeze({approval:'Sentinel_332537c518588191842f486f58707087',scenarioIds:Object.freeze(['colour-cheaper','saved-products','booking-handoff']),totalNano:5000000000,priorCount:239,priorNano:4415668400,maxNewCalls:24,mainCalls:24,maxTurns:6,maxPerTurn:4,maxOutput:1400,reserveNano:SMALL.reserveNano,validUntil:Date.parse('2026-10-17T23:59:59+05:00'),maxTotalNano:4859082800});
function check(dir,now=Date.now()){
 if(process.env.VERCEL||process.env.VERCEL_ENV||now>=POLICY.validUntil)throw Error('PRICE_OR_ISOLATION');
 if(fs.existsSync(path.join(dir,'critical-recheck239-started.json'))||fs.existsSync(path.join(dir,'critical-recheck239-executing.json')))throw Error('APPROVAL_ALREADY_USED');
 const report=require('../assistant-critical-recheck.cjs').prepare(dir);
 const start=JSON.parse(fs.readFileSync(path.join(dir,'started.json'),'utf8'));if(start.approval!==SMALL.approval)throw Error('LEDGER_MISMATCH');
 if(report.maxAggregateReserveUsd*1e9!==POLICY.maxTotalNano||POLICY.reserveNano!==18475600||POLICY.priorNano+POLICY.maxNewCalls*POLICY.reserveNano!==POLICY.maxTotalNano||POLICY.maxTotalNano>POLICY.totalNano)throw Error('BUDGET_MATH');
 return report;
}
function claim(dir,now=Date.now()){
 const report=check(dir,now);const fd=fs.openSync(path.join(dir,'critical-recheck239-started.json'),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({...POLICY,ledgerFingerprint:report.ledgerFingerprint,expiresAt:Math.min(now+2*3600000,POLICY.validUntil)}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
function allowance(transport,dir,now=()=>Date.now()){
 let calls=0,turns=0,inTurn=0,busy=false,closed=false,stopReason=null,scenario=-1,scenarioTurns=0;const marker=JSON.parse(fs.readFileSync(path.join(dir,'critical-recheck239-started.json'),'utf8'));if(marker.approval!==POLICY.approval||marker.priorCount!==239||marker.priorNano!==POLICY.priorNano)throw Error('CLAIM_MISMATCH');const deadline=marker.expiresAt;if(!Number.isSafeInteger(deadline)||deadline>POLICY.validUntil||deadline>now()+2*3600000)throw Error('CLAIM_EXPIRY');
 for(const [key,value] of Object.entries(POLICY))if(JSON.stringify(marker[key])!==JSON.stringify(value))throw Error('CLAIM_MISMATCH');
 if(marker.ledgerFingerprint!==require('../assistant-critical-recheck.cjs').prepare(dir).ledgerFingerprint)throw Error('LEDGER_MISMATCH');
 const lock=fs.openSync(path.join(dir,'critical-recheck239-executing.json'),'wx',0o600);try{fs.writeFileSync(lock,JSON.stringify({approval:POLICY.approval,startedAt:now()}));fs.fsyncSync(lock)}finally{fs.closeSync(lock)}

 const stop=reason=>{closed=true;stopReason??=reason;throw Error(reason)};
 const valid=()=>{if(closed)throw Error(stopReason);if(now()>=deadline)stop('SESSION_EXPIRED')};
 const counts=()=>({newCalls:calls,totalCalls:239+calls,reservedNano:POLICY.priorNano+calls*POLICY.reserveNano});
 return{get closed(){return closed},get stopReason(){return stopReason},counts,beginScenario(id){valid();if(busy||(scenario>=0&&scenarioTurns!==2)||id!==POLICY.scenarioIds[scenario+1])stop('SCENARIO_LIMIT');scenario++;scenarioTurns=0},beginTurn(){valid();if(scenario<0||++scenarioTurns>2)stop('SCENARIO_LIMIT');if(busy||++turns>POLICY.maxTurns){stop('TURN_LIMIT')}inTurn=0},provider:{async create(raw,signal){
  valid();if(busy||signal.aborted||!turns||!scenarioTurns||inTurn>=4||calls>=POLICY.maxNewCalls)stop('CALL_OR_TURN_LIMIT');let body;try{body=snapshot(raw)}catch{stop('REQUEST_POLICY_LIMIT')}
  if(POLICY.priorNano+(calls+1)*POLICY.reserveNano>POLICY.maxTotalNano)stop('BUDGET_LIMIT');
  busy=true;calls++;inTurn++;const attempt=239+calls;let stage='DEBIT',observed=null;
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
