const assert=require('node:assert/strict');global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const {explicitSizeEvidence}=require('../lib/assistant/chat/explicit-size-evidence.ts');
const {childContext}=require('../lib/assistant/chat/child-context.ts');
Date.now=()=>Date.parse('2026-10-22T11:00Z');let context=emptyOutfit(),messages=[],reviews=0;
const patch=(field,value,quote)=>({field,value,quote,slot:'dress'});
const wire=x=>({status:'completed',output:[],outputTokens:60,outputText:JSON.stringify(x)});
const fn=args=>({status:'completed',outputText:'',outputTokens:60,output:[{type:'function_call',name:'remember_request',call_id:'fixture',arguments:JSON.stringify(args)}]});
async function turn(text,steps){const reply=await runAssistantConversation({syntheticOnly:true,branchId:f.branch,context,messages:[...messages,{role:'user',content:text}]},{create:async b=>{assert(b.instructions.includes(childContext));if(b.text.format.name==='conversation_boundary_review'){reviews++;return wire({safeSentenceIds:[0],preferenceDecision:'allow',reason:'all_safe'})}assert(steps.length);return steps.shift()}},await createCrmTools({organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false}),new AbortController().signal);assert.equal(steps.length,0);context=reply.context;messages.push({role:'user',content:text},{role:'assistant',content:reply.message});assert(!reply.recoveryReason);return reply;}
const final=(message,changes=[])=>wire({message,preferenceChanges:changes,factRefs:[],cardIds:[],productRefs:[]});
(async()=>{
 await turn('Мне нужно платье',[final('Какой размер платья нужен ребёнку?')]);
 await turn('На завтра',[fn({changes:[],calendar:{start:{kind:'relative',value:'tomorrow',quote:'завтра'},days:null,durationQuote:null}}),final('Какой размер платья нужен ребёнку?')]);
 const changes=[patch('size','110','110'),patch('color','желтое','желтое'),patch('note','осенний бал','на осенний бал')];
 await turn('110, нужно желтое платье на осенний бал',[fn({changes,calendar:null}),final('На сколько дней нужен наряд?',changes)]);
 assert.equal(context.criteria.dress.size,'110');assert.equal(context.criteria.dress.color,'желтое');assert(context.notes.includes('на осенний бал'));assert.equal(context.pendingRentalStart.fromDay,'2026-10-23');assert.equal(context.until,null);assert.equal(f.reads.length,0);
 assert(explicitSizeEvidence('110','110, нужно желтое платье','Какой размер платья нужен ребёнку?','dress','dress'));
 for(const [text,previous] of [['рост 110, желтое платье','Какой размер?'],['110, желтое платье','Какой размер или рост у ребёнка?'],['110 рублей, желтое платье','Какой размер?'],['110, желтое платье','Какой размер обуви?']])assert(!explicitSizeEvidence('110',text,previous,'dress','dress'));
 await turn('Рост 108',[final('Какой цвет ещё рассматриваете?',[patch('heightCm','108','Рост 108')])]);assert.equal(context.heightCm,108);assert.equal(context.criteria.dress.size,'110');assert.equal(context.pendingRentalStart.fromDay,'2026-10-23');
 assert.equal(reviews,4);console.log('PASS OFFLINE child context reaches planner/reviewer; exact 3-turn multi-parameter reply retains size/color/occasion/tomorrow; height distinct; no early search. Scripted provider, not live model quality.');
})().catch(e=>{console.error(e);process.exitCode=1});
