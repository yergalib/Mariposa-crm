// Scripted responses, actual runtime and synthetic public service. No HTTP/DB.
const assert=require('node:assert/strict'),Module=require('node:module');
const load=Module._load;Module._load=function(k,...args){if(/^(?:node:)?(?:https?|net|tls)$/.test(k))throw Error('NETWORK_FORBIDDEN');return load.call(this,k,...args)};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts');
const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const {explicitColorCorrection}=require('../lib/assistant/chat/explicit-color-evidence.ts');
const {assessDialogue}=require('./lib/assistant-dialogue-assessment.cjs');
const {safeTrace}=require('./assistant-evaluation-suite.cjs');
const base=()=>{const c=emptyOutfit();Object.assign(c,{from:new Date(Date.now()+7*86400000).toISOString().slice(0,10)+'T12:00',until:new Date(Date.now()+8*86400000).toISOString().slice(0,10)+'T18:00',heightCm:138,notes:['Не люблю объёмные платья.']});c.criteria.dress={size:'140',color:'Белый',categoryId:f.category};return c};
const response=data=>({status:'completed',output:[],outputTokens:40,outputText:JSON.stringify(data)});
const answer=(extra={})=>response({message:'Учла пожелания.',preferenceChanges:[],cardIds:[],productRefs:[],factRefs:[],...extra});
const call=(name,args)=>({...response({}),output:[{type:'function_call',name,call_id:name,arguments:JSON.stringify(args)}]});
async function run(steps,extra={},review={safeSentenceIds:[0],preferenceDecision:'allow',reason:'all_safe'}){let i=0;return runAssistantConversation({syntheticOnly:true,branchId:f.branch,context:base(),messages:[{role:'user',content:'Покажи варианты'}],...extra},{create:async b=>{if(b.text.format.name==='conversation_boundary_review')return response(review);assert(i<steps.length);const step=steps[i++];return typeof step==='function'?step(b):step}},await createCrmTools({organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false}),new AbortController().signal)}
(async()=>{
 // Reproduce the two exact error classes. These are controlled ID substitutions,
 // not a claim to reconstruct omitted raw IDs from the paid run.
 await assert.rejects(()=>run([call('find_dresses',{slot:'dress'}),answer({cardIds:[f.id(10)]})]),/Карточка не подтверждена CRM/);
 await assert.rejects(()=>run([call('find_dresses',{slot:'dress'}),answer({productRefs:[{productId:f.id(10),executionId:null}]})]),/Сравнение нужно уточнить/);
 const found=await run([call('find_dresses',{slot:'dress'}),b=>{const r=JSON.parse(b.input.find(x=>x.type==='function_call_output').output);assert.equal(r.cards[0].cardId,f.id(20));assert.equal(r.cards[0].variantId,f.id(20));return answer({cardIds:[r.cards[0].cardId]})}]);assert.equal(found.cards.length,1);
 // Proven code defect: an unrelated preference acknowledgement erased verified
 // product detail. This exact scripted sequence failed before the fix.
 const patch={field:'activeSlot',slot:null,value:'dress',quote:'платье'};
 const compared=await run([call('get_product',{productId:f.id(10),executionId:''}),call('remember_preferences',{changes:[patch]}),answer({preferenceChanges:[patch],productRefs:[{productId:f.id(10),executionId:null}]})],{products:[{productId:f.id(10),executionId:null}],messages:[{role:'user',content:'Сравни платье'}]});assert.equal(compared.comparisons.length,1);
 await assert.rejects(()=>run([call('get_product',{productId:f.id(99),executionId:''}),answer({productRefs:[{productId:f.id(99),executionId:null}]})]),/Сравнение нужно уточнить/);
 const prompt='Лучше синее, остальные пожелания и даты те же. Есть вариант дешевле первого?';
 assert.equal(explicitColorCorrection(prompt),'Синий');
 for(const text of ['Лучше не синее.','Лучше синее?','Лучше синее, если подойдёт.','Лучше синее, но хочу красное.','Хочу синее для обуви.','Она сказала: лучше синее.'])assert.equal(explicitColorCorrection(text),null,text);
 const kept=await run([answer()],{messages:[{role:'user',content:prompt}]},{malformed:true});assert.equal(kept.context.criteria.dress.color,'Синий');assert.equal(kept.context.criteria.dress.size,'140');assert.equal(kept.context.heightCm,138);assert.equal(kept.context.from,base().from);assert.equal(kept.cards.length,0);
 const stalePatch={field:'size',slot:'dress',value:'146',quote:'размер 146'};
 await assert.rejects(()=>run([call('find_dresses',{slot:'dress'}),answer({preferenceChanges:[stalePatch],cardIds:[f.id(20)]})],{messages:[{role:'user',content:'Теперь размер 146'}]}),/Карточка не подтверждена CRM/);
 const generic={reply:{message:'Не удалось надёжно проверить ответ.',cards:[]}};
 assert.equal(assessDialogue([generic,generic],{noReceipt:true}).taskStatus,'FAIL');assert.equal(assessDialogue([generic],{noReceipt:true}).safetyStatus,'INCOMPLETE_OR_FAIL');
 assert.equal(assessDialogue([{reply:{message:'Учла'}},{reply:{message:'Учла'}}],{noReceipt:true}).taskStatus,'REVIEW_REQUIRED');
 const trace=safeTrace({input:[{type:'function_call_output',output:JSON.stringify({cards:[{productId:f.id(10),item:{id:f.id(20)}}]})}],text:{format:{name:'consultant_reply'}}},answer({cardIds:[f.id(10)]}));assert.deepEqual(trace.at(-1).cardReferenceKinds,['product-in-card-field']);assert(!JSON.stringify(trace).includes(f.id(10)));
 console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,checks:['product-as-card-rejected','search-not-product-read','explicit-card-reference','noncriteria-patch-preserves-comparison','unreferenced-product-rejected','changed-size-invalidates-card','explicit-color-survives-invalid-review','ambiguous-color-not-inferred','no-false-task-pass','safe-reference-diagnostics']}));
})().catch(e=>{console.error(e);process.exitCode=1});
