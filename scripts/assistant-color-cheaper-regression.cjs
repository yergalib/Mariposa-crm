// Scripted provider, actual consultation/tools/reviewer boundary, synthetic service.
const assert=require('node:assert/strict');global.fetch=()=>{throw Error('NO_NETWORK')};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts'),{emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const signal=new AbortController().signal,session={organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false};
const call=(name,args)=>({status:'completed',output:[{type:'function_call',name,call_id:name,arguments:JSON.stringify(args)}],outputText:'',outputTokens:30});
const answer=(message,changes=[],cards=[])=>({status:'completed',output:[],outputText:JSON.stringify({message,preferenceChanges:changes,cardIds:cards,productRefs:[],factRefs:[]}),outputTokens:50});
const patch={field:'color',slot:'dress',value:'синее',quote:'синее'};
const prompt='Лучше синее, остальные пожелания и даты те же. Есть вариант дешевле первого?';
async function turn(context,message,steps,decision='allow'){
 let index=0;const outputs=[];
 const reply=await runAssistantConversation({syntheticOnly:true,branchId:f.branch,context,messages:[{role:'user',content:message}]},{create:async b=>{
  if(b.text.format.name==='conversation_boundary_review'){
   assert(b.instructions.includes('A note alone or color:null'));return{status:'completed',output:[],outputTokens:30,outputText:JSON.stringify({safeSentenceIds:[0],preferenceDecision:decision,reason:decision==='allow'?'all_safe':'unsupported_preferences'})};
  }
  assert(b.instructions.includes('perform the requested search/comparison'));
  for(const i of b.input)if(i.type==='function_call_output')outputs.push(JSON.parse(i.output));
  assert(index<steps.length);return steps[index++];
 }},await createCrmTools(session),signal);assert.equal(index,steps.length);return{reply,outputs};
}
(async()=>{
 const context=emptyOutfit();context.from=new Date(Date.now()+7*86400000).toISOString().slice(0,10)+'T12:00';context.until=new Date(Date.now()+8*86400000).toISOString().slice(0,10)+'T18:00';context.heightCm=138;context.notes=['Не люблю объёмные платья.'];context.criteria.dress={size:'140',color:'Белый',categoryId:f.category};
 const first=await turn(context,'Подбери белое, размер 140, рост 138.',[call('find_dresses',{slot:'dress'}),answer('Учла пожелания.',[],[f.id(20)])]);assert.equal(first.reply.cards.length,1);
 const catalog=f.service.publicCatalog,readsBefore=f.reads.length;
 for(const mode of ['success','empty','error','unknown-price']){
  const select=f.service.publicSelectedCard;
  f.service.publicCatalog=mode==='empty'?async()=>({items:[],more:false,page:1,appliedColor:'Синий'}):mode==='error'?async()=>{throw new Error('Synthetic service unavailable')}:catalog;
  if(mode==='unknown-price')f.service.publicSelectedCard=async a=>{const c=await select(a);return{...c,item:{...c.item,price:null}}};
  const result=await turn(first.reply.context,prompt,[call('remember_preferences',{changes:[patch]}),call('find_cheaper',{slot:'dress',referenceVariantId:f.id(20)}),answer(mode==='success'?'Учла синий цвет и остальные пожелания.':mode==='empty'?'В этой подборке подходящий вариант не найден.':'Сейчас сравнение не удалось проверить.',[patch],mode==='success'?[f.id(21)]:[])]);
  const c=result.reply.context;assert.equal(c.criteria.dress.color,'синее');assert.equal(c.criteria.dress.size,'140');assert.equal(c.heightCm,138);assert.equal(c.from,context.from);assert.equal(c.until,context.until);assert.deepEqual(c.notes,context.notes);
  assert(!result.reply.message.includes('?'));assert(!result.reply.message.includes('пришл'));
  const last=result.outputs.at(-1);
  if(mode==='success'){assert.equal(result.reply.cards[0].item.id,f.id(21));assert.equal(last.reference.item.price.amountMinor,'18000');assert.equal(last.cards[0].item.price.amountMinor,'12000');assert.equal(last.cards[0].item.price.currency,last.reference.item.price.currency);assert.equal(last.cards[0].item.available,true);assert(!last.error)}
  else{assert.equal(result.reply.cards.length,0);if(mode==='empty'){assert.equal(last.cards.length,0);assert(!last.error)}else assert(last.error)}
  f.service.publicSelectedCard=select;
 }
 f.service.publicCatalog=catalog;assert(f.reads.length>readsBefore);assert.equal(f.reads.at(-1).color,'синее');
 const invalid=[{...patch,value:null},{field:'note',slot:null,value:'Лучше синее',quote:'Лучше синее'}];
 const rejected=await turn(first.reply.context,prompt,[answer('Учла пожелание.',invalid)],'clarify');assert.equal(rejected.reply.context.criteria.dress.color,'Белый');assert.equal(rejected.reply.cards.length,0);
 const omitted=await turn(first.reply.context,prompt,[call('find_dresses',{slot:'dress'}),answer('Учла пожелание.',[],[f.id(20)])],'clarify');assert.equal(omitted.reply.cards.length,0);assert.equal(omitted.reply.context.criteria.dress.color,'Белый');
 const unavailable=await turn(first.reply.context,prompt,[call('remember_preferences',{changes:[patch]}),call('find_cheaper',{slot:'dress',referenceVariantId:f.id(999)}),answer('Сравнение пока не подтверждено.',[patch])]);assert(unavailable.outputs.at(-1).error);assert.equal(unavailable.reply.cards.length,0);
 console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,checks:['two-turn-positive-colour-and-cheaper-card','actual-existing-catalog-colour-normalization','dates-size-height-notes-retained','current-tool-prices-only','empty-result-not-tool-error','real-tool-exception-fail-closed','unknown-reference-price-fail-closed','unknown-reference-rejected','reviewer-can-reject-null-plus-note'],limitations:'Scripted planner/reviewer decisions; live model correction still needs a separately initiated bounded check.'}));
})().catch(e=>{console.error(e);process.exitCode=1});
