// Offline contract regression, NOT an evaluation of live model understanding.
const assert=require('node:assert/strict');global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
Date.now=()=>Date.parse('2026-10-21T05:00:00Z');
const wire=x=>({status:'completed',output:[],outputTokens:50,outputText:JSON.stringify(x)});
const patch=(field,value,quote,slot=null)=>({field,value,quote,slot});
let scripted=0,cases=0;
async function run(context,text,changes,message='Пожелания сохранены. Во сколько заберёте и вернёте платье?',previous='Подскажите пожелания.'){
 let plans=0;const provider={create:async b=>{scripted++;if(b.text.format.name==='conversation_boundary_review')return wire({safeSentenceIds:[0,1],preferenceDecision:'allow',reason:'all_safe'});assert(changes!==undefined,'unexpected model delegation: '+text);plans++;return wire({message,preferenceChanges:changes,cardIds:[],productRefs:[],factRefs:[]})}};
 const r=await runAssistantConversation({syntheticOnly:true,branchId:f.branch,context,messages:[{role:'user',content:'Ищу платье на осенний бал'},{role:'assistant',content:previous},{role:'user',content:text}]},provider,await createCrmTools({organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false}),new AbortController().signal);cases++;return {r,plans};
}
(async()=>{
const screenshot=emptyOutfit();screenshot.criteria.dress.size='90';screenshot.criteria.dress.color='Жёлтый';screenshot.notes=['осенний бал'];
for(const text of ['на завтра, на сутки','22.10.-23.10']){const {r,plans}=await run(screenshot,text,undefined,undefined,'Поняла: для осеннего бала ищете жёлтое платье, размер90. Чтобы подобрать варианты, нужны даты аренды.');assert.equal(plans,0);assert.equal(r.context.dateDraft.fromDay,'2026-10-22');assert.equal(r.context.dateDraft.untilDay,'2026-10-23');assert.equal(r.context.criteria.dress.size,'90');assert.equal(r.context.criteria.dress.color,'Жёлтый');assert(r.context.notes.includes('осенний бал'));assert.equal(r.context.from,null);assert.equal(r.context.until,null);assert.match(r.message,/Во сколько/);}
for(const [text,start,end] of [['размер 90, завтра на день','2026-10-22','2026-10-23'],['рост 90, послезавтра на 1 день','2026-10-23','2026-10-24'],['размер 90, завтра на 2 дня','2026-10-22','2026-10-24'],['размер 90, 25.10.2026 на сутки','2026-10-25','2026-10-26'],['2026-10-26 на 3 дня','2026-10-26','2026-10-29']]){const {r,plans}=await run(emptyOutfit(),text);assert.equal(plans,0);assert.equal(r.context.dateDraft.fromDay,start);assert.equal(r.context.dateDraft.untilDay,end);assert.equal(r.context.from,null);assert.equal(r.context.until,null);assert.match(r.message,/Во сколько/);if(text.startsWith('рост')){assert.equal(r.context.heightCm,90);assert.equal(r.context.criteria.dress.size,null)}}
let {r}=await run(emptyOutfit(),'рост 90, завтра на день');let c=r.context;
({r}=await run(c,'размер 90'));assert.equal(r.context.heightCm,90);assert.equal(r.context.criteria.dress.size,'90');c=r.context;c.criteria.dress.color='Белый';
const draft=structuredClone(c.dateDraft);
const pink=structuredClone(c);pink.criteria.dress.color='Розовый';const excluded=await run(pink,'Не розовое',[patch('color',null,'Не розовое','dress')]);assert.equal(excluded.r.context.criteria.dress.color,null);assert(excluded.r.context.notes.includes('Не розовое'),'same-colour exclusion must remain a preference');
let result=await run(c,'Бюджет теперь до 5000',[patch('note','Бюджет теперь до 5000','Бюджет теперь до 5000')]);assert.equal(result.plans,1);assert(result.r.context.notes.includes('Бюджет теперь до 5000'));assert.deepEqual(result.r.context.dateDraft,draft);c=result.r.context;
result=await run(c,'Не розовое',[patch('color',null,'Не розовое','dress')]);assert.equal(result.plans,1);assert.equal(result.r.context.criteria.dress.color,'Белый');assert(result.r.context.notes.includes('Не розовое'));assert.deepEqual(result.r.context.dateDraft,draft);c=result.r.context;
({r}=await run(c,'размер 100'));assert.equal(r.context.criteria.dress.size,'100');assert(r.context.notes.includes('Бюджет теперь до 5000'));c=r.context;
({r}=await run(c,'послезавтра на день'));assert.equal(r.context.dateDraft.fromDay,'2026-10-23');assert.equal(r.context.criteria.dress.size,'100');assert.equal(r.context.heightCm,90);c=r.context;
({r}=await run(c,'заберу в 11:00'));assert.equal(r.context.from,'2026-10-23T11:00');assert.equal(r.context.until,null);assert.match(r.message,/Во сколько вернёте/);
const before=structuredClone(c);result=await run(c,'2026-10-25 11:00 — 2026-10-26 18:00',[patch('from','2026-10-25T11:00','2026-10-25 11:00'),patch('until','2026-10-26T18:00','2026-10-26 18:00')]);assert.equal(result.r.context.dateDraft,undefined);assert.equal(result.r.context.from,'2026-10-25T11:00');assert.equal(result.r.context.criteria.dress.size,'100');
result=await run(before,'2026-10-25 11:00',[patch('from','2026-10-27T11:00','2026-10-25 11:00')]);assert.deepEqual(result.r.context.dateDraft,before.dateDraft,'unverified replacement cannot destroy draft');
result=await run(before,'Может не завтра, а через неделю?',[], 'Какую дату получения вы выбираете?');assert.equal(result.plans,1);assert.deepEqual(result.r.context.dateDraft,before.dateDraft);
result=await run(before,'Есть похожие варианты, но дешевле?',[], 'С каким платьем сравнить цену?');assert.equal(result.plans,1);assert(result.r.context.notes.includes('Бюджет теперь до 5000'));assert.deepEqual(result.r.context.dateDraft,before.dateDraft);
for(const prompt of ['завтра или послезавтра на день','2026-11-31 на день','завтра на 32 дня','31.11.-02.12','23.10.-22.10','31.12.-01.01','22.10.-30.11','может 22.10.-23.10']){result=await run(before,prompt,[], 'Уточните дату и длительность.');assert.equal(result.plans,1);assert.deepEqual(result.r.context.dateDraft,before.dateDraft)}
const full=emptyOutfit();Object.assign(full,{from:'2026-10-25T11:00',until:'2026-10-26T18:00',notes:['осенний бал']});full.criteria.dress.size='140';
({r}=await run(full,'любой цвет'));assert.equal(r.cards.length,2);assert.equal(r.context.criteria.dress.color,'');assert(r.context.notes.includes('осенний бал'));
const constrained=structuredClone(full);constrained.notes.push('Бюджет до 5000','Не розовое');result=await run(constrained,'любой цвет',[], 'Сохраняю ограничение бюджета и исключение розового.');assert.equal(result.plans,1,'existing semantic constraints require normal grounded pipeline');assert(result.r.context.notes.includes('Не розовое'));
const mixed=emptyOutfit();mixed.criteria.dress.color='Белый';result=await run(mixed,'размер 90, завтра на день, заберу в 11:00, верну в 18:00, бюджет до 5000',[]);assert.equal(result.plans,1);assert(result.r.context.notes.some(n=>n.includes('бюджет до 5000')));assert.equal(result.r.context.from,'2026-10-22T11:00');
const original=f.service.publicCatalog;f.service.publicCatalog=async()=>({items:[],more:false,page:1});({r}=await run(full,'любой цвет'));assert.equal(r.cards.length,0);assert.match(r.message,/вариантов нет/);f.service.publicCatalog=original;
console.log(JSON.stringify({status:'OFFLINE_PASS',cases,scriptedTransportReplies:scripted,realModelCalls:0,liveDatabase:false,scope:'deterministic parsing, model-patch evidence, routing and state continuity; not live model quality'}));
})().catch(e=>{console.error(e);process.exitCode=1});
