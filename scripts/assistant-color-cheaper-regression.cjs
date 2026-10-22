// Scripted provider, actual consultation/tools/reviewer boundary, synthetic service.
const assert=require('node:assert/strict');global.fetch=()=>{throw Error('NO_NETWORK')};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts'),{emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const {explicitColorCorrection}=require('../lib/assistant/chat/explicit-color-evidence.ts');
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
 const context=emptyOutfit();context.from=new Date(Date.now()+7*86400000).toISOString().slice(0,10)+'T15:00';context.until=new Date(Date.now()+8*86400000).toISOString().slice(0,10)+'T12:00';context.heightCm=138;context.notes=['Не люблю объёмные платья.'];context.criteria.dress={size:'140',color:'Белый',categoryId:f.category};
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
 const canonical=await turn(first.reply.context,prompt,[call('remember_preferences',{changes:[patch]}),call('find_cheaper',{slot:'dress',referenceVariantId:f.id(20)}),answer('Учла пожелания.',[{...patch,value:'Синий'}],[f.id(21)])]);assert.equal(canonical.reply.cards[0].item.id,f.id(21));
 for(const changed of ['Голубой','',null])await assert.rejects(()=>turn(first.reply.context,prompt,[call('remember_preferences',{changes:[patch]}),call('find_cheaper',{slot:'dress',referenceVariantId:f.id(20)}),answer('Учла пожелания.',[{...patch,value:changed}],[f.id(21)])]),e=>e.status===502&&e.message==='Карточка не подтверждена CRM.');
 const invalid=[{...patch,value:null},{field:'note',slot:null,value:'Лучше синее',quote:'Лучше синее'}];
 const before=structuredClone(first.reply.context);
 function assertRejected(reply,color){
  // The reviewer must still reject model edits, prose and all business panels.
  assert.equal(reply.context.criteria.dress.color,color);
  assert.deepEqual(reply.context.criteria,{...before.criteria,dress:{...before.criteria.dress,color}});
  for(const key of ['from','until','heightCm','notes','activeSlot','items'])assert.deepEqual(reply.context[key],before[key],key);
  assert.deepEqual(reply.cards,[]);assert.deepEqual(reply.comparisons,[]);assert.deepEqual(reply.facts,[]);assert.deepEqual(reply.outfit,{});
  assert.notEqual(reply.message,'Учла пожелание.');
  assert.deepEqual(first.reply.context,before,'input context must not be mutated');
 }
 // Since e7bb410 an exact user command is saved independently of model edits.
 // A negative reviewer verdict cannot undo it, nor approve null + note or cards.
 assert.equal(explicitColorCorrection(prompt),'Синий');
 const rejected=await turn(first.reply.context,prompt,[answer('Учла пожелание.',invalid)],'clarify');assertRejected(rejected.reply,'Синий');
 // The search already uses saved blue even when the model omits its patch.
 // An old white ID is not in that search and must still fail provenance checks.
 await assert.rejects(()=>turn(first.reply.context,prompt,[call('find_dresses',{slot:'dress'}),answer('Учла пожелание.',[],[f.id(20)])],'clarify'),e=>e.status===502&&e.message==='Карточка не подтверждена CRM.');
 const omitted=await turn(first.reply.context,prompt,[call('find_dresses',{slot:'dress'}),answer('Учла пожелание.',[],[f.id(21)])],'clarify');assertRejected(omitted.reply,'Синий');
 assert.equal(omitted.outputs.at(-1).cards[0].item.id,f.id(21));
 // Outside the exact grammar the reviewer remains authoritative: no inferred blue.
 const ambiguous='Может быть, лучше синее?';assert.equal(explicitColorCorrection(ambiguous),null);
 const unconfirmed=await turn(first.reply.context,ambiguous,[answer('Учла пожелание.',[patch])],'clarify');assertRejected(unconfirmed.reply,'Белый');
 const excluded='Не синее.';assert.equal(explicitColorCorrection(excluded),null);
 const negative=await turn(first.reply.context,excluded,[answer('Учла пожелание.',[patch])],'clarify');assertRejected(negative.reply,'Белый');
 // Model-first policy removes hidden regex recovery after an invented ID.
 // Keep the explicit valid-reference success above and reject unknown IDs.
 const unavailable=await turn(first.reply.context,'Лучше синее.',[call('remember_preferences',{changes:[patch]}),call('find_cheaper',{slot:'dress',referenceVariantId:f.id(999)}),answer('Сравнение пока не подтверждено.',[patch])]);assert(unavailable.outputs.at(-1).error);assert.equal(unavailable.reply.cards.length,0);
 const recovered=await turn(first.reply.context,prompt,[call('remember_preferences',{changes:[patch]}),call('find_cheaper',{slot:'dress',referenceVariantId:f.id(999)}),answer('Сравнение пока не подтверждено.',[patch])]);assert(recovered.outputs.at(-1).error);assert.deepEqual(recovered.reply.cards,[]);assert.equal(recovered.reply.message,'Сравнение пока не подтверждено.');
 // An exclusion preserves an unrelated saved colour, and clears only itself.
 const exclusion={field:'color',slot:'dress',value:null,quote:'не розовое'};
 const excludedPink=await turn(first.reply.context,'Только не розовое.',[answer('Учла исключение.',[exclusion])]);
 assert.equal(excludedPink.reply.context.criteria.dress.color,'Белый');assert(excludedPink.reply.context.notes.includes('не розовое'));
 const pink=structuredClone(first.reply.context);pink.criteria.dress.color='Розовый';
 const clearedPink=await turn(pink,'Только не розовое.',[answer('Какой другой цвет рассмотреть?',[exclusion])]);
 assert.equal(clearedPink.reply.context.criteria.dress.color,null);assert.deepEqual(clearedPink.reply.cards,[]);
 for(const r of [excludedPink,clearedPink]){assert.equal(r.reply.context.from,before.from);assert.equal(r.reply.context.until,before.until);assert.equal(r.reply.context.heightCm,before.heightCm);assert.equal(r.reply.context.criteria.dress.size,'140');}
 console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,checks:['two-turn-positive-colour-and-cheaper-card','actual-existing-catalog-colour-normalization','dates-size-height-notes-retained','current-tool-prices-only','empty-result-not-tool-error','real-tool-exception-fail-closed','unknown-reference-price-fail-closed','unknown-reference-rejected','reviewer-rejects-model-null-note-and-panels-without-undoing-explicit-user-blue','ambiguous-and-negated-blue-do-not-replace-white','input-context-not-mutated'],limitations:'Scripted planner/reviewer decisions; no live model call.'}));
})().catch(e=>{console.error(e);process.exitCode=1});
