// Synthetic transport only; never contacts a provider or database.
const assert=require('node:assert/strict'),Module=require('node:module');
const load=Module._load;Module._load=function(k,...a){if(/^(?:node:)?(?:https?|net|tls)$/.test(k))throw Error('NETWORK_FORBIDDEN');return load.call(this,k,...a)};
require('./assistant-small-smoke-fixture.cjs');
const {reviewConversation,REVIEW_OUTPUT_LIMIT,clarification}=require('../lib/assistant/chat/verified-reply.ts');
const {snapshot,usage,POLICY}=require('./lib/assistant-small-smoke.cjs');
const {OWNER_TEST}=require('../lib/assistant/chat/owner-test.ts');
const {safeTrace}=require('./assistant-evaluation-suite.cjs');
const verdict={safeSentenceIds:[0],preferenceDecision:'allow',reason:'all_safe'};
(async()=>{
 let request;const signal=new AbortController().signal;
 const reply=await reviewConversation('Учту ваши пожелания.',{create:async b=>{request=b;snapshot(b);return{status:'completed',output:[],outputText:JSON.stringify(verdict),outputTokens:150}}},signal);
 assert.equal(REVIEW_OUTPUT_LIMIT,300);assert.equal(request.max_output_tokens,300);assert.equal(reply.preferencesAccepted,true);assert.equal(OWNER_TEST.reviewOutput,300);
 assert.throws(()=>snapshot({...request,max_output_tokens:301}),/REVIEW_POLICY/);
 assert.equal(POLICY.reserveNano,18475600);assert.equal(POLICY.maxOutput,1400);assert.equal(OWNER_TEST.reservationNano,9570000);
 for(const bad of [{status:'incomplete',outputTokens:100,outputText:JSON.stringify(verdict)},{status:'completed',outputTokens:301,outputText:JSON.stringify(verdict)},{status:'completed',outputTokens:150,outputText:'{"safeSentenceIds":'}]){
  const r=await reviewConversation('Учту ваши пожелания.',{create:async()=>({output:[],...bad})},signal);assert.equal(r.message,clarification);assert.equal(r.preferencesAccepted,false);
 }
 assert.throws(()=>usage({status:'incomplete',model:POLICY.model,service_tier:'default',usage:{input_tokens:813,output_tokens:100}},300),/UNKNOWN_USAGE/);
 const trace=safeTrace({input:[{type:'function_call_output',output:JSON.stringify({results:[{name:'find_cheaper',result:{cards:[],reference:{item:{id:'synthetic'}}}}]})}],text:{format:{name:'consultant_reply'}}},{output:[{type:'function_call',name:'read_batch',arguments:JSON.stringify({requests:[{name:'find_cheaper',referenceVariantId:'DO_NOT_SAVE'}]})}]});
 assert(trace.some(t=>t.kind==='tool-call'&&t.name==='find_cheaper'&&t.batched));assert(trace.some(t=>t.kind==='tool-result'&&t.reference&&!t.error));assert(!JSON.stringify(trace).includes('DO_NOT_SAVE'));
 console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,reviewOutputLimit:300,reserveUnchanged:true,incompleteAndMalformedFailClosed:true,batchedCheaperTrace:true,limitation:'Scripted tests do not prove that the live model completes within 300 tokens.'}));
})().catch(e=>{console.error(e);process.exitCode=1});
