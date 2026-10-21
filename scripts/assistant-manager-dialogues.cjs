// Full multi-turn orchestration fixtures. Scripted model/reviewer, NEVER a quality benchmark.
const assert=require('node:assert/strict'),fs=require('node:fs');
global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const {emptyOutfit,outfitContextSchema}=require('../lib/assistant/chat/outfit-contracts.ts');
const {resolveRentalRequest,serverClock}=require('../lib/assistant/chat/calendar-request.ts');
const {ownerRequest}=require('../lib/assistant/chat/owner-test-request.ts');
let now=Date.parse('2026-10-21T18:59:00Z');Date.now=()=>now;
const wire=x=>({status:'completed',output:[],outputTokens:80,outputText:JSON.stringify(x)});
const final=(message,changes=[],ids=[])=>wire({message,preferenceChanges:changes,cardIds:ids,productRefs:[],factRefs:[]});
const call=(name,args)=>({status:'completed',outputText:'',outputTokens:40,output:[{type:'function_call',name,arguments:JSON.stringify(args),call_id:'fixture_'+name}]});
const patch=(field,value,quote,slot='dress')=>({field,value,quote,slot});
const start=(value,quote,kind='relative')=>({start:{kind,value,quote},days:null,durationQuote:null});
const duration=quote=>({start:null,days:1,durationQuote:quote});
const branch={id:f.branch,timezone:'Asia/Almaty'};
const payloads=[];let context=emptyOutfit(),history=[],calls=0;const transcript=[];
const session={organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false};
async function turn(text,steps,{reject=false}={}){
 const original=JSON.stringify(context);let plans=0,reviews=0;
 const r=await runAssistantConversation({syntheticOnly:true,branchId:f.branch,context,messages:[...history.slice(-8),{role:'user',content:text}]},{create:async b=>{
  payloads.push({kind:b.text.format.name,bytes:Buffer.byteLength(JSON.stringify(b)),outputCap:b.max_output_tokens});calls++;assert.equal(b.model,'gpt-6-luna');
  if(b.text.format.name==='conversation_boundary_review'){reviews++;return wire({safeSentenceIds:reject?[]:[0],preferenceDecision:reject?'clarify':'allow',reason:reject?'unsupported_preferences':'all_safe'})}
  plans++;ownerRequest(b);assert(b.instructions.includes('Trusted server calendar context'));assert(!b.instructions.includes('Relative or ambiguous dates require clarification'));
  const strict=s=>{if(!s||typeof s!=='object')return;if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual([...(s.required??[])].sort(),Object.keys(s.properties).sort())}for(const v of Object.values(s)){if(Array.isArray(v))v.forEach(strict);else if(v&&typeof v==='object')strict(v)}};
  b.tools.forEach(t=>strict(t.parameters));
  const step=steps.shift();assert(step,'unplanned model call');return typeof step==='function'?step(b):step;
 }},await createCrmTools(session),new AbortController().signal);
 assert.equal(steps.length,0);assert(plans>0,'ordinary language must reach model');assert.equal(reviews,1);
 assert.equal(JSON.stringify(context),original,'input state mutated');context=outfitContextSchema.parse(JSON.parse(JSON.stringify(r.context)));
 history.push({role:'user',content:text},{role:'assistant',content:r.message});transcript.push({user:text,reply:r.message,plans,reviews,context,cards:r.cards.length});return r;
}
(async()=>{
 // Owner's exact workflow. The fixture has no yellow stock; no invented alternative.
 const color=patch('color','жёлтое','желтое');
 await turn('у вас есть желтое платье на завтра?',[
  call('remember_request',{changes:[color],calendar:start('tomorrow','завтра')}),
  final('Какой размер платья нужен?', [color])]);
 assert.equal(context.pendingRentalStart.fromDay,'2026-10-22');assert.equal(context.from,null);assert.equal(f.reads.length,0);
 await turn('140',[call('remember_preferences',{changes:[patch('size','140','140')]}),final('На сколько дней нужен наряд?', [patch('size','140','140')])]);
 assert.equal(context.criteria.dress.size,'140');assert.equal(context.pendingRentalStart.fromDay,'2026-10-22');assert.equal(f.reads.length,0);
 let r=await turn('На один день',[call('remember_request',{changes:[],calendar:duration('один день')}),call('find_dresses',{slot:'dress'}),final('Можем рассмотреть другой цвет?')]);
 assert.equal(context.from,'2026-10-22T15:00');assert.equal(context.until,'2026-10-23T12:00');assert.equal(r.cards.length,0);assert.equal(f.reads.length,1);assert.equal(r.message,'Можем рассмотреть другой цвет?');assert.equal(r.facts[0].kind,'search');
 await turn('Тогда лучше синее',[call('remember_preferences',{changes:[patch('color','синее','синее')]}),call('find_dresses',{slot:'dress'}),final('Посмотрите этот вариант.',[patch('color','синее','синее')],[f.id(21)])]);
 assert.equal(context.until,'2026-10-23T12:00');assert.equal(context.criteria.dress.size,'140');
 await turn('Не розовое',[call('remember_preferences',{changes:[patch('color',null,'Не розовое')]}),final('Какие ещё пожелания учесть?',[patch('color',null,'Не розовое')])]);
 assert.equal(context.criteria.dress.color,'синее');assert(context.notes.includes('Не розовое'));
 await turn('любой цвет',[call('remember_preferences',{changes:[patch('color','','любой цвет')]}),call('find_dresses',{slot:'dress'}),final('Посмотрите эти варианты.',[patch('color','','любой цвет')],[f.id(20),f.id(21)])]);
 assert.equal(context.criteria.dress.color,'');assert.equal(transcript.at(-1).cards,2);
 await turn('Подготовь черновик, но не отправляй',[final('Открыть форму обращения можно после выбора вещи.')]);
 // Date correction invalidates complete old period; never silently carries duration.
 await turn('Лучше в субботу',[call('remember_request',{changes:[],calendar:start('6','субботу','weekday')}),final('На сколько дней планируете взять платье?')]);
 assert.equal(context.pendingRentalStart.fromDay,'2026-10-24');assert.equal(context.until,null);
 const beforeReads=f.reads.length;
 await turn('Покажи варианты сейчас',[call('find_dresses',{slot:'dress'}),final('На сколько дней нужен наряд?')]);
 assert.equal(f.reads.length,beforeReads);
 // Calendar arithmetic / ambiguity / no implicit duration.
 const base=emptyOutfit();let checks=0;
 for(const [clock,expected,rolled] of [['2026-10-24T09:00:00Z','2026-10-24',false],['2026-10-24T14:59:00Z','2026-10-24',false],['2026-10-24T15:00:00Z','2026-10-31',true]]){
  const x=resolveRentalRequest(start('6','субботу','weekday'),base,'в субботу',branch,Date.parse(clock));assert.equal(x.result.fromDay,expected);assert.equal(x.result.rolledPastPickupWindow,rolled);assert.equal(x.context.until,null);checks++;
 }
 assert.equal(serverClock('Asia/Almaty',Date.parse('2026-10-21T19:01:00Z')).localDate,'2026-10-22');checks++;
 for(const [text,request] of [['не завтра',start('tomorrow','завтра')],['может завтра',start('tomorrow','может завтра')],['завтра',start('day_after_tomorrow','завтра')],['на три дня',{start:null,days:1,durationQuote:'три дня'}]]){
  assert.throws(()=>resolveRentalRequest(request,context,text,branch,now));checks++;
 }
 const saved=JSON.stringify(context);
 await turn('На один день',[call('remember_request',{changes:[],calendar:duration('один день')}),final('Уточните пожелания.')],{reject:true});
 assert.equal(JSON.stringify(context),saved,'review rejection must roll back calendar');
 // Wrong-tenant branch and unexposed writes cannot be routed to real services.
 await assert.rejects(async()=>runAssistantConversation({syntheticOnly:true,branchId:f.id(999),context,messages:[{role:'user',content:'Покажи платье'}]},{create:async()=>{throw Error('model must not run')}},await createCrmTools(session),new AbortController().signal));
 // Paraphrases/typos stay conversational: evidence is a quoted word, not whole-message regex.
 for(const text of ['Пожалуста, платьице желтое нужно завтра','Можно на завтра желтое?','Ищу желтое платье, завтра праздник']){
  context=emptyOutfit();history=[];await turn(text,[call('remember_request',{changes:[color],calendar:start('tomorrow','завтра')}),final('Какой размер платья нужен?',[color])]);assert.equal(context.pendingRentalStart.fromDay,'2026-10-22');checks++;
 }
 const summary={status:'OFFLINE_PASS',turns:transcript.length,calendarChecks:checks,scriptedProviderCalls:calls,realModelCalls:0,databaseWrites:0,limitations:'Scripted provider and validator: tests orchestration, not live language comprehension or quality.'};
 fs.mkdirSync('docs/evidence',{recursive:true});fs.writeFileSync('docs/evidence/assistant-manager-dialogues.json',JSON.stringify({summary,payloads,transcript},null,2));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1});
