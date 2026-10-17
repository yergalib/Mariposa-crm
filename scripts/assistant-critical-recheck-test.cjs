const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const load=Module._load;Module._load=function(k,...a){if(/^(?:node:)?(?:https?|net|tls)$/.test(k))throw Error('NETWORK_FORBIDDEN');return load.call(this,k,...a)};
global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const {prepare,specifications,assessCritical}=require('./assistant-critical-recheck.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-critical-prep-'));
for(let n=1;n<=239;n++){fs.writeFileSync(path.join(dir,`attempt-${n}.json`),JSON.stringify({attempt:n,reservedNano:n*18475600}));if(![1,2,132,136].includes(n))fs.writeFileSync(path.join(dir,`usage-${n}.json`),'{}')}
fs.mkdirSync(path.join(dir,'evaluation-repeat-16-resume136'));fs.writeFileSync(path.join(dir,'evaluation-repeat-16-resume136/result.json'),JSON.stringify({status:'EVALUATION_COMPLETED',totalCalls:239,reservedNano:4415668400}));
const first=prepare(dir),second=prepare(dir);assert.deepEqual(first,second);assert.equal(first.maxNewCalls,24);assert.equal(first.maxAggregateReserveUsd,4.8590828);assert.equal(first.executionEnabled,false);
fs.writeFileSync(path.join(dir,'attempt-240.json'),'{}');assert.throws(()=>prepare(dir),/LEDGER_CHANGED/);
const suite=require('./assistant-evaluation-suite.cjs'),specs=specifications(suite);assert.equal(specs.length,3);assert.equal(specs.reduce((n,s)=>n+s.prompts.length,0),6);
const {clarification}=require('../lib/assistant/chat/verified-reply.ts');
const reply={message:clarification,cards:[],context:{from:'2026-10-24T12:00',until:'2026-10-25T18:00'}};
for(const spec of specs){const r=assessCritical(spec.id,[{reply},{reply}],[{kind:'review',parseable:false,decision:'invalid',responseStatus:'completed'}]);assert.equal(r.taskStatus,'FAIL');assert.equal(r.checks.noReviewFailure,false)}
const handoff=[{reply:{...reply,message:'Я не могу создать или подтвердить бронь.'}},{reply:{...reply,message:'Черновик — не отправлен, заявка не создана. 2026-10-24T12:00 140 138'}}];
assert.equal(assessCritical('booking-handoff',handoff,[]).taskStatus,'REVIEW_REQUIRED');
handoff[1].reply.inquiryId='not-real';assert.equal(assessCritical('booking-handoff',handoff,[]).taskStatus,'FAIL');
console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,checks:['239-attempt-ledger-unchanged','24-call-ceiling','reject-new-history','six-turn-plan','reviewer-failure-never-pass','no-receipt','no-automatic-pass']}));
