const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {snapshot}=require('./lib/assistant-small-smoke.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-conversation-'));let calls=0,turns=0,step=0;const bytes=[];
const a={closed:false,beginTurn(){turns++;step=0},provider:{create:async raw=>{const b=snapshot(raw);bytes.push(Buffer.byteLength(JSON.stringify(b)));calls++;const review=b.text.format.name==='conversation_boundary_review';
 if(!review&&step++===0)return{status:'completed',output:[{type:'function_call',call_id:'synthetic',name:'read_batch',arguments:JSON.stringify({requests:[{name:'get_rental_rules'},{name:'get_contacts'}]})}],outputTokens:40,outputText:''};
 return{status:'completed',output:[],outputTokens:40,outputText:JSON.stringify(review?{safeSentenceIds:[0],preferenceDecision:'allow',reason:'all_safe'}:{message:'Помогу с выбором.',preferenceChanges:[],factRefs:['rules:approved','contacts:approved'],cardIds:[],productRefs:[]})}}}};
const expectedTurns=process.argv.includes('--two-turns')?2:3;
require('./assistant-small-smoke-fixture.cjs')(a,dir,expectedTurns).then(r=>{assert.equal(turns,expectedTurns);assert.equal(calls,expectedTurns*3);assert(r.checks.every(c=>Object.values(c).every(Boolean)));console.log(JSON.stringify({status:'OFFLINE_PASS',turns,calls,networkCalls:0,payloadBytes:bytes,checks:r.checks}))}).catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(dir,{recursive:true,force:true}));
