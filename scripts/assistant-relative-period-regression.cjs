// Offline only: actual consultation/criteria/CRM-tool pipeline, synthetic transport/data.
const assert=require('node:assert/strict');
global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts');
const {emptyOutfit,outfitContextSchema}=require('../lib/assistant/chat/outfit-contracts.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const {applyRelativePeriod}=require('../lib/assistant/chat/relative-period.ts');
Date.now=()=>Date.parse('2026-10-20T20:00:00Z'); // Already October 21 in Almaty.
const branch={id:f.branch,timezone:'Asia/Almaty'};
const provider={create:async()=>{throw Error('Unexpected provider call')}};
async function run(context,text,messages=[]){return runAssistantConversation({syntheticOnly:true,branchId:f.branch,context,messages:[...messages,{role:'user',content:text}]},provider,await createCrmTools({organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false}),new AbortController().signal)}
(async()=>{
 const initial=emptyOutfit();initial.heightCm=88;initial.criteria.dress.color='Белый';
 const history=[{role:'user',content:'Ищу платье на осенний бал'},{role:'assistant',content:'Подскажите размер и даты аренды?'}];
 let r=await run(initial,'размер 90. платье нужно на завтра на 1 день',history);
 assert.equal(r.context.criteria.dress.size,'90');assert.equal(r.context.heightCm,88);assert.equal(r.context.criteria.dress.color,'Белый');
 assert.deepEqual(r.context.dateDraft,{fromDay:'2026-10-22',untilDay:'2026-10-23',...{branchId:branch.id,timezone:branch.timezone}});
 assert.equal(r.context.from,null);assert.equal(r.context.until,null);assert.match(r.message,/Во сколько/);assert.doesNotMatch(r.message,/надёжно|Какой размер/);assert.equal(r.cards.length,0);assert(r.context.notes.some(n=>n.includes('осенний бал')));
 let restored=outfitContextSchema.parse(JSON.parse(JSON.stringify(r.context)));
 const any=structuredClone(restored);applyRelativePeriod(any,'любой цвет','',branch);assert.equal(any.criteria.dress.color,'');assert.equal(any.criteria.dress.size,'90');
 Date.now=()=>Date.parse('2026-10-21T20:00:00Z'); // Draft must not slide forward across midnight.
 r=await run(restored,'заберу в 11:00');assert.equal(r.context.from,'2026-10-22T11:00');assert.equal(r.context.until,null);assert.match(r.message,/Во сколько вернёте/);
 r=await run(r.context,'верну в 18:00');assert.equal(r.context.until,'2026-10-23T18:00');assert.equal(r.context.dateDraft,undefined);assert.equal(r.context.criteria.dress.size,'90');assert.equal(r.context.heightCm,88);assert(r.context.notes.some(n=>n.includes('осенний бал')));
 const searchContext=structuredClone(r.context);searchContext.criteria.dress.size='140';searchContext.criteria.dress.color=null;
 const anyReply=await run(searchContext,'любой цвет');assert.equal(anyReply.cards.length,2);assert.equal(anyReply.context.criteria.dress.color,'');assert.equal(anyReply.context.from,searchContext.from);assert(anyReply.context.notes.some(n=>n.includes('осенний бал')));
 const originalCatalog=f.service.publicCatalog;f.service.publicCatalog=async()=>({items:[],more:false,page:1});
 const empty=await run(searchContext,'любой цвет');assert.equal(empty.cards.length,0);assert.match(empty.message,/вариантов нет/);
 f.service.publicCatalog=async()=>{throw Error('synthetic read failure')};
 const failed=await run(searchContext,'любой цвет');assert.equal(failed.cards.length,0);assert.match(failed.message,/не удалось проверить/);assert.equal(failed.context.criteria.dress.size,'140');assert.equal(failed.context.criteria.dress.color,'');
 f.service.publicCatalog=originalCatalog;
 assert(f.reads.some(q=>q.from==='2026-10-22T11:00'&&q.until==='2026-10-23T18:00'&&q.size==='90'),'real search boundary receives preserved criteria');
 for(const text of ['рост 90. платье на завтра на 1 день','размер наверное 90. платье на завтра на 1 день']){const c=emptyOutfit();applyRelativePeriod(c,text,'',branch);assert.equal(c.criteria.dress.size,null)}
 for(const text of ['не завтра на 1 день','может завтра на 1 день?','послезавтра на 1 день']){const c=emptyOutfit();assert.equal(applyRelativePeriod(c,text,'',branch),null);assert.equal(c.dateDraft,undefined)}
 const c=emptyOutfit();applyRelativePeriod(c,'размер 90, завтра на 1 день','',branch);const before=structuredClone(c);assert.equal(applyRelativePeriod(c,'заберу в 11:00, верну в 18:00','',{...branch,id:f.id(99)}),null);assert.deepEqual(c,before);
 console.log(JSON.stringify({status:'PASS',realModelCalls:0,liveDatabaseUsed:false,checks:['exact autumn-ball dialogue','branch midnight','fixed dates on next day','separate pickup/return hours','size/height distinction','colour/event continuity','restored schema','CRM search criteria','negative/ambiguous requests','branch mismatch']}));
})().catch(e=>{console.error(e);process.exitCode=1});
