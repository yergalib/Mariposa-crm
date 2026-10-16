// Synthetic fixtures and scripted provider decisions only; never load DB/env files.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
global.fetch=()=>{throw Error('Network forbidden in offline test')};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),branch=id(2),category=id(3),product=id(4),variant=id(5);
process.env.STOREFRONT_ORGANIZATION_ID=org; // this test process only
const from=new Date(Date.now()+7*86400000).toISOString().slice(0,10)+'T12:00';
const until=new Date(Date.now()+8*86400000).toISOString().slice(0,10)+'T18:00';
const searches=[];
const item={id:variant,name:'Синтетическое синее платье',size:'140',execution:null,price:null,available:true};
const detail={id:product+':default',productId:product,executionId:null,name:item.name,color:'синий',images:[],sizes:['140'],options:[{id:variant,size:'140',sizeCode:'140',price:null}]};
class ShowroomError extends Error {}
const service={ShowroomError,publicBranches:async()=>[{id:branch,name:'Тестовый филиал',city:'Тестовый город',timezone:'Asia/Almaty'}],publicCategories:async()=>[{id:category,name:'Платья'}],publicProduct:async args=>{assert.equal(args.productId,product);return detail},publicCatalog:async args=>{searches.push(args);return{items:[{productId:product,executionId:null,variants:[item]}],appliedColor:'синий',more:false}}};
const load=Module._load,resolve=Module._resolveFilename;
Module._resolveFilename=function(k,...a){return resolve.call(this,k.startsWith('@/')?path.resolve(k.slice(2)):k,...a)};
Module._load=function(k,...a){if(k==='server-only')return{};if(k==='@/lib/showroom/service')return service;if(k==='@/app/showroom/site-content')return{rentalSteps:['Выберите платье','Запишитесь на примерку','Верните после праздника'],showroomContact:{city:'Тестовый город',address:'Тестовый адрес',hours:'Тестовое расписание',whatsapp:'https://example.invalid/contact',map:'https://example.invalid/map'}};return load.call(this,k,...a)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts');
const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const {reviewConversation,clarification}=require('../lib/assistant/chat/verified-reply.ts');
const signal=new AbortController().signal,session={organizationId:org,allowedBranchIds:[branch],hasOrganizationWideBranchAccess:false};
const call=(name,args)=>({status:'completed',output:[{type:'function_call',name,arguments:JSON.stringify(args),call_id:name}],outputText:'',outputTokens:40});
const answer=(message,extra={})=>({status:'completed',output:[],outputText:JSON.stringify({message,preferenceChanges:[],factRefs:[],cardIds:[],productRefs:[],...extra}),outputTokens:60});
const reviews=[],messages=[],checks=[];
let context=emptyOutfit();Object.assign(context,{from,until,heightCm:138,notes:['Мне неуютно в слишком пышном платье.'],calendarPeriod:true});context.criteria.dress={size:'140',color:'белый',categoryId:category};
async function turn(prompt,steps,reviewIds){let step=0;const tools=await createCrmTools(session);const result=await runAssistantConversation({syntheticOnly:true,branchId:branch,context,messages:[...messages,{role:'user',content:prompt}]},{create:async body=>{
  if(body.text.format.name==='conversation_boundary_review'){
    assert(Buffer.byteLength(JSON.stringify(body))<=8000,'review remains within existing cap');
    const data=JSON.parse(body.input[0].content);reviews.push(data);
    assert(body.instructions.includes('no closing question is required'));
    return{status:'completed',output:[],outputText:JSON.stringify({safeSentenceIds:reviewIds??data.sentences.map(s=>s.id),preferenceDecision:'allow',reason:'all_safe'}),outputTokens:30};
  }
  assert(body.instructions.includes('A question is optional'));
  assert(body.instructions.includes('never a source of current prices'));
  assert(!body.instructions.includes('Do not repeat verified panel contents'));
  assert(Buffer.byteLength(JSON.stringify(body))<=48000);
  assert(step<steps.length,'unexpected extra provider call');return steps[step++];
}},tools,signal);assert.equal(step,steps.length);context=result.context;messages.push({role:'user',content:prompt},{role:'assistant',content:result.message});return result;}
(async()=>{
  const first=await turn('Расскажите о порядке аренды и как с вами связаться.',[
    call('read_batch',{requests:[{name:'get_rental_rules'},{name:'get_contacts'}]}),
    answer('Конечно, вот порядок аренды и контакты шоурума.',{factRefs:['rules:approved','contacts:approved']})]);
  assert.equal(first.facts.length,2);assert.equal(searches.length,0);assert(!first.message.includes('?'));checks.push('Rules and contacts from current tools without irrelevant search or question');
  const patch={field:'color',slot:'dress',value:'синий',quote:'синий'};
  const second=await turn('Теперь хочу синий цвет. Найдите варианты на те же даты и размер.',[
    call('remember_preferences',{changes:[patch]}),call('find_dresses',{slot:'dress'}),
    answer('Учту синий цвет и ваше пожелание обойтись без лишнего объёма.',{preferenceChanges:[patch],cardIds:[variant]})]);
  assert.equal(searches.length,1);assert.equal(searches[0].from,from);assert.equal(searches[0].until,until);assert.equal(searches[0].size,'140');assert.equal(searches[0].color,'синий');
  assert.equal(second.context.heightCm,138);assert.equal(second.context.notes[0],'Мне неуютно в слишком пышном платье.');assert.equal(second.cards[0].item.id,variant);assert.equal(second.cards[0].item.price,null);checks.push('Colour correction preserves dates, explicit size, height and comfort preference; actual CRM tool DTO card');
  assert.equal(reviews.at(-1).continuity.knownPreferences.criteria.dress.size,'140');assert.equal(reviews.at(-1).continuity.knownPreferences.from,from);
  const third=await turn('Спасибо, пока посмотрю.',[answer('Хорошо, выбирайте спокойно. На какие даты нужно платье?')],[0]);
  assert.equal(third.message,'Хорошо, выбирайте спокойно.');assert.equal(third.context.from,from);assert.equal(searches.length,1);checks.push('Reviewer can remove redundant known-date question while retaining natural acknowledgement');
  const fourth=await turn('Бронь уже подтверждена?',[answer('Бронь подтверждена. Я не могу оформить бронь в этом чате.')],[1]);
  assert.equal(fourth.message,'Я не могу оформить бронь в этом чате.');checks.push('Unsafe booking status removed; truthful limitation preserved');
  const badTools=await createCrmTools(session);
  await assert.rejects(()=>runAssistantConversation({syntheticOnly:true,branchId:branch,context,messages:[{role:'user',content:'Покажи платье'}]},{create:async()=>answer('Вот вариант.',{cardIds:[id(99)]})},badTools,signal),e=>e.status===502);
  await assert.rejects(()=>createCrmTools({...session,organizationId:id(99)}),e=>e.status===403);checks.push('Invented card and cross-tenant tools rejected');
  const invalidSize=await runAssistantConversation({syntheticOnly:true,branchId:branch,context,messages:[{role:'user',content:'Рост 138'}]},{create:async()=>answer('Учту размер.',{preferenceChanges:[{field:'size',slot:'dress',value:'140',quote:'Рост 138'}]})},await createCrmTools(session),signal);
  assert.equal(invalidSize.message,clarification);assert.equal(invalidSize.cards.length,0);checks.push('Height cannot authorize size inference');
  const failure=await reviewConversation('Что вам важнее?',{create:async()=>{throw Error('offline reviewer failure')}},signal);
  assert.equal(failure.message,clarification);assert.equal(failure.preferencesAccepted,false);assert(!clarification.includes('?'));checks.push('Failed review stays closed without a generic repeated question');
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{AssistantFactPanels}=require('../app/showroom/AssistantFactPanels.tsx'),{AssistantThread}=require('../app/showroom/AssistantThread.tsx'),{AssistantProductCard}=require('../app/showroom/AssistantProductCard.tsx');
  const h=React.createElement;
  assert.equal(renderToStaticMarkup(h(AssistantFactPanels,{})),'');
  const html=renderToStaticMarkup(h(AssistantThread,{messages:[{role:'user',content:'Порядок аренды и контакты?'},{role:'assistant',content:first.message,facts:first.facts},{role:'user',content:'Теперь хочу синий цвет, на те же даты.'},{role:'assistant',content:second.message,cards:second.cards}],pending:false,onSend:async()=>{throw Error('Unexpected send')},onCancel:()=>{},renderMessage:m=>h('article',{className:`chat-message chat-${m.role}`},h('strong',null,m.role==='user'?'Вы':'MARIPOSA'),h('p',null,m.content),h(AssistantFactPanels,{facts:m.facts}),m.cards?.length?h('div',{className:'selection-results'},m.cards.map(card=>h(AssistantProductCard,{key:card.item.id,card,pending:false,onSelect:()=>{}}))):null)}));
  assert(html.includes('Тестовый адрес'));assert(html.includes('Выберите платье. Запишитесь на примерку.'));assert(!html.includes('отдельные панели'));assert(!html.includes('В разговорном ответе возможны ошибки'));assert(!html.includes('<ul><li>Выберите платье'));
  const escaped=renderToStaticMarkup(h(AssistantFactPanels,{facts:[{id:'rules:approved',kind:'rules',lines:['<script>unsafe</script>']}]}));assert(escaped.includes('&lt;script&gt;'));assert(!escaped.includes('<script>'));
  checks.push('Actual assistant runtime, fact prose and product components SSR; escaping and no empty repeated disclaimer');
  const out=path.resolve('../assistant-manager-20261016');fs.mkdirSync(out,{recursive:true});
  const css=fs.readFileSync('app/globals.css','utf8')+'\n'+fs.readFileSync('app/showroom/showroom.css','utf8');
  fs.writeFileSync(path.join(out,'ui.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\nbody{margin:0;padding:12px;background:#faf8f5}.chat-log{max-width:760px;margin:auto}.chat-message{overflow-wrap:anywhere}</style><body><main class="showroom"><p>Локальный UI — синтетические данные, модель выключена</p><dialog open class="selection-dialog chat-dialog"><div class="selection-dialog-header"><h2>MARIPOSA · Подбор</h2></div><p>Синтетический UI, без модели</p><div class="chat-transcript">'+html+'</div></dialog></main></body></html>');
  const evidence={status:'PASS',checks,modelCalls:0,networkCalls:0,limitations:'Scripted reviewer decisions validate integration, not live model style or classifier accuracy. No database writes.',ui:path.join(out,'ui.html')};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(e);process.exitCode=1});
