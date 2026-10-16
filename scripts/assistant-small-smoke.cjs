const fs=require('node:fs'),path=require('node:path');
const {POLICY,check,claim,allowance}=require('./lib/assistant-small-smoke.cjs');
const {checkResume,claimResume}=require('./lib/assistant-small-smoke-resume.cjs');
const dir=path.resolve(__dirname,'../../assistant-smoke-approval-20261016-144953');
function transportReport(directory){
 const events=[];const save=event=>{events.push(event);fs.writeFileSync(path.join(directory,'transport.json'),JSON.stringify(events),{mode:0o600})};
 return {summary:()=>{const status=events.findLast(e=>e.stage==='HTTP_STATUS')?.status;return status===401?'AUTHENTICATION_REJECTED':status&&status!==200?'HTTP_REJECTED':'RUN_FAILED'},transportReady:()=>save({stage:'READY'}),httpStart:()=>save({stage:'HTTP_START'}),httpStatus:status=>save({stage:'HTTP_STATUS',status:Number.isInteger(status)&&status>=100&&status<=599?status:null}),error:code=>save({stage:'ERROR',code:['HTTP_ERROR','INTERRUPTED','TRANSPORT_ERROR'].includes(code)?code:'UNKNOWN'})};
}
async function readKey(){const chunks=[];let size=0;try{for await(const chunk of process.stdin){size+=chunk.length;if(size>512)throw Error('KEY_LENGTH');chunks.push(chunk)}return Buffer.concat(chunks)}finally{for(const c of chunks)c.fill(0)}}
async function main(){
 const resume=process.argv.includes('--resume');
 (resume?checkResume:check)(dir);const scenario=require('./assistant-small-smoke-fixture.cjs');
 if(process.argv[2]==='--check'){console.log('READY');return}
 if(process.argv[2]!=='--live')throw Error('MODE');
 const options=resume?claimResume(dir):(claim(dir),{});
 const evidence=resume?path.join(dir,'resume-evidence'):dir;
 fs.mkdirSync(evidence,{recursive:true});let key,transport,a,report;
 try{key=await readKey();if(!/^sk-[A-Za-z0-9_-]{20,500}$/.test(key.toString('ascii')))throw Error('KEY_FORMAT');report=transportReport(evidence);transport=require('./assistant-smoke-local.cjs').makeTransport(key,require('node:https').request,report);a=allowance(transport,dir,()=>Date.now(),options);const outcome=await scenario(a,evidence,resume?2:3);const result={status:'LIVE_COMPLETED',attempts:a.count,reservedTokenUsd:a.reservedNano/1e9,...outcome};fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))}
 catch{const result={status:'STOPPED',code:report?.summary()??'LOCAL_FAILURE',attempts:a?.count??options.initialCount??0,reservedTokenUsd:(a?.reservedNano??(options.initialCount??0)*POLICY.reserveNano)/1e9,noRetry:true};fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result));console.log(JSON.stringify(result));process.exitCode=2}
 finally{key?.fill(0);transport?.dispose()}
}
function preflightFailure(error){
 const codes=['RESUME_ALREADY_USED_OR_UNEXPECTED_HISTORY','LEDGER_MISMATCH','ISOLATION_OR_PRICE','APPROVAL_ALREADY_USED'];
 return {status:'STOPPED_BEFORE_KEY',code:codes.includes(error?.message)?error.message:'READINESS_FAILED'};
}
if(require.main===module){const timer=setTimeout(()=>process.exit(3),600000);main().catch(error=>{console.log(JSON.stringify(preflightFailure(error)));process.exitCode=2}).finally(()=>{clearTimeout(timer);process.stdin.destroy()})}
module.exports={transportReport};
module.exports.preflightFailure=preflightFailure;
