// No network or live model: actual orchestration + scripted review and CRM fixtures.
const assert=require('node:assert/strict');global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
Date.now=()=>Date.parse('2026-10-22T05:47:00Z');
const original=f.service.publicProduct;
f.service.publicProduct=async input=>({...await original(input),color:input.productId===f.id(10)?'Шампань':'Золотой',execution:null});
const call=(name,args)=>({status:'completed',outputTokens:30,outputText:'',output:[{type:'function_call',name,call_id:name,arguments:JSON.stringify(args)}]});
const prose='Для вашего запроса — варианты ниже. Обратите внимание на оттенок: в подборке есть шампань и золотистый, которые могут отличаться от желаемого жёлтого.';
async function run({compare,empty,verdict=[0],decision='allow'}){
 const context=emptyOutfit();context.from='2026-10-23T15:00';context.until='2026-10-24T12:00';context.criteria.dress={color:'Жёлтый',size:'140',categoryId:f.category};
 const refs=compare?[{productId:f.id(10),executionId:null},{productId:f.id(11),executionId:null}]:[];
 const requests=[...(empty?[{name:'find_dresses',slot:'dress'}]:[]),...refs.map(r=>({name:'get_product',...r,executionId:''}))];
 const steps=[call('read_batch',{requests}),{status:'completed',outputTokens:50,output:[],outputText:JSON.stringify({message:prose,preferenceChanges:[],cardIds:[],productRefs:refs,factRefs:[]})}];
 const reply=await runAssistantConversation({syntheticOnly:true,branchId:f.branch,context,products:refs,messages:[{role:'user',content:compare?'Сравни выбранные платья с запросом на жёлтое, размер 140.':'Нужно желтое платье размера 140 на завтра, на один день.'}]},{create:async body=>body.text.format.name==='conversation_boundary_review'?{status:'completed',output:[],outputTokens:30,outputText:JSON.stringify({safeSentenceIds:verdict,preferenceDecision:decision,reason:'mixed_prose'})}:steps.shift()},await createCrmTools({organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false}),new AbortController().signal);
 assert.equal(steps.length,0);assert.equal(reply.context.criteria.dress.color,'Жёлтый');assert.equal(reply.context.criteria.dress.size,'140');assert.equal(reply.context.until,context.until);assert.equal(reply.cards.length,0);return reply;
}
(async()=>{
 for(const verdict of [[0],[],[0,1]]){
  for(const empty of [false,true]){
   const r=await run({compare:true,empty,verdict});assert.equal(r.comparisons.length,2);assert.match(r.message,/не означают точного совпадения/);const fact=r.facts.find(f=>f.id==='comparison:scope');assert(fact);assert.equal(fact.lines.filter(x=>x.includes('не подтверждено')).length,2);if(empty)assert.match(r.message,/нет вариантов/);
  }
  const r=await run({compare:false,empty:true,verdict});assert.match(r.message,/нет вариантов/);assert(!r.message.includes('варианты ниже'));assert.equal(r.comparisons.length,0);
 }
 const rejected=await run({compare:true,empty:true,verdict:[],decision:'clarify'});assert.equal(rejected.comparisons.length,0);assert.equal(rejected.cards.length,0);
 console.log('PASS: 10 offline reviewer paths; champagne/gold comparisons never exact yellow matches; omitted/retained caveat and no prose cannot hide server facts; empty search cannot become promise; rejected review hides panels; dates/size preserved. No provider/DB calls.');
})().catch(e=>{console.error(e);process.exitCode=1});
