const assert=require('node:assert/strict');global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const {AssistantError}=require('../lib/assistant/chat/limits.ts');
Date.now=()=>Date.parse('2026-10-21T05:00:00Z');
const wire=x=>({status:'completed',output:[],outputTokens:50,outputText:JSON.stringify(x)});
const final=changes=>wire({message:'Пожелания учтены.',preferenceChanges:changes,cardIds:[],productRefs:[],factRefs:[]});
const call=()=>({...wire({}),output:[{type:'function_call',name:'find_dresses',call_id:'search',arguments:JSON.stringify({slot:'dress'})}]});
function base(){const c=emptyOutfit();c.criteria.dress={size:'90',color:'Жёлтый',categoryId:f.category};c.notes=['осенний бал'];return c}
let cases=0;
async function run(text,steps,{context=base(),review=wire({safeSentenceIds:[0],preferenceDecision:'allow',reason:'all_safe'}),tools}={}){let n=0;const result=await runAssistantConversation({syntheticOnly:true,branchId:f.branch,context,messages:[{role:'user',content:text}]},{create:async b=>b.text.format.name==='conversation_boundary_review'?review:steps[n++]},tools??await createCrmTools({organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false}),new AbortController().signal);assert.equal(n,steps.length);cases++;return result}
(async()=>{
const bad={field:'color',slot:'dress',value:'Синий',quote:'не существующая цитата'};
let r=await run('размер 100; цвет лунный',[final([{field:'size',slot:'dress',value:'100',quote:'размер 100'},bad])]);assert.equal(r.recoveryReason,'preference_not_confirmed');assert.equal(r.context.criteria.dress.size,'100');assert.equal(r.context.criteria.dress.color,'Жёлтый');assert(r.context.notes.includes('осенний бал'));assert.equal(r.cards.length,0);
r=await run('рост 100; цвет лунный',[final([bad])]);assert.equal(r.context.heightCm,100);assert.equal(r.context.criteria.dress.size,'90');
for(const text of ['не размер 100; цвет лунный','размер 100; размер 110; цвет лунный','может размер 100; цвет лунный','размер 100; обувь нужна тоже','размер 100; это старый размер']){r=await run(text,[final([bad])]);assert.equal(r.context.criteria.dress.size,'90');}
r=await run('размер 100; цвет лунный',[{...wire({}),outputText:'{broken'}]);assert.equal(r.recoveryReason,'invalid_model_response');assert.equal(r.context.criteria.dress.size,'100');assert.equal(r.cards.length,0);
r=await run('размер 100; цвет лунный',[final([])],{review:{...wire({}),outputText:'{broken'}});assert.equal(r.recoveryReason,'review_unavailable');assert.equal(r.context.criteria.dress.size,'100');assert(!r.message.includes('Пожелания учтены'));
const pending=base();pending.dateDraft={fromDay:'2026-10-22',untilDay:'2026-10-23',branchId:f.branch,timezone:'Asia/Almaty'};
r=await run('Покажи варианты',[call(),final([])],{context:pending});assert.equal(r.recoveryReason,'missing_information');assert.match(r.message,/дат/);assert(!r.message.includes('Во сколько'));
const full=base();full.from='2026-10-22T15:00';full.until='2026-10-23T12:00';
const tools=await createCrmTools({organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false});tools.execute=async()=>{throw new AssistantError('synthetic timeout',504)};
r=await run('Покажи варианты',[call()],{context:full,tools});assert.equal(r.recoveryReason,'tool_timeout');assert.match(r.message,/Наличие неизвестно/);assert.equal(r.cards.length,0);assert.equal(r.context.from,full.from);
const unavailable=await createCrmTools({organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false});unavailable.execute=async()=>{throw Error('synthetic unavailable')};
r=await run('Покажи варианты',[call(),final([])],{context:full,tools:unavailable});assert.equal(r.recoveryReason,'tool_unavailable');assert.match(r.message,/не означает/);assert.equal(r.cards.length,0);
r=await run('Покажи варианты',[final([])],{review:wire({safeSentenceIds:[],preferenceDecision:'allow',reason:'unsafe_prose'})});assert.equal(r.recoveryReason,'prose_not_confirmed');assert.equal(r.cards.length,0);
console.log(JSON.stringify({status:'OFFLINE_PASS',cases,realModelCalls:0,liveDatabase:false,checks:'literal partial preferences, negative/conflicting/wrong-slot exclusions, malformed model vs review, missing hours, actual tool timeout vs failed read'}));
})().catch(e=>{console.error(e);process.exitCode=1});
