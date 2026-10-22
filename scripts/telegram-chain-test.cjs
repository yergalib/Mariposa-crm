const assert=require('node:assert/strict'),Module=require('node:module');
global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {recordTurn,reviewRecordedTurn,checkpointRecord}=require('../lib/assistant/chat/recorded-turn.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const {handleTelegramUpdate,resumeTelegramUpdate,renderTelegramReply}=require('../lib/assistant/telegram/handler.ts');
const now=Date.parse('2026-10-22T08:00:00Z');Date.now=()=>now;
const binding={enabled:true,consent:true,organizationId:f.id(1),membershipId:f.id(5),branchId:f.branch,botId:123456,userId:10,chatId:10,generation:f.id(6),start:now-1000,until:now+3600000};
const event={update_id:1,message:{message_id:1,date:Math.floor(now/1000),from:{id:10,is_bot:false},chat:{id:10,type:'private'},text:'Жёлтое платье размера 140 на завтра на один день'}};
const changes=[{field:'size',slot:'dress',value:'140',quote:'140'},{field:'color',slot:'dress',value:'жёлтое',quote:'Жёлтое'}];
const response=x=>({status:'completed',output:[],outputTokens:70,outputText:JSON.stringify(x)});
const scripted=[{status:'completed',outputText:'',outputTokens:100,output:[{type:'function_call',name:'remember_and_find',call_id:'fixture',arguments:JSON.stringify({slot:'dress',changes,calendar:{start:{kind:'relative',value:'tomorrow',quote:'на завтра'},days:1,durationQuote:'один день'}})}]},response({message:'Для вашего запроса — варианты ниже:',preferenceChanges:changes,cardIds:[],productRefs:[],factRefs:[]})];
const rows=new Map();let modelCalls=0,reviewCalls=0,sends=0,history=0,delivery='unsent',storedContext,denied=false;
const repo={async begin(key,hash){if(rows.has(key))return {created:false,row:structuredClone(rows.get(key))};const row={id:key,requestHash:hash,state:'planning',candidate:null,result:null,expiresAt:now+600000};rows.set(key,row);return {created:true,row:structuredClone(row)}},async read(id){return rows.has(id)?structuredClone(rows.get(id)):null},async stage(id,hash,candidate){Object.assign(rows.get(id),{candidate,state:'review_ready'});return true},async claimReview(id){const r=rows.get(id);if(r.state!=='review_ready')return null;r.state='review_running';return structuredClone(r)},async complete(id,result){Object.assign(rows.get(id),{state:'complete',result:checkpointRecord(result)})},async block(id){rows.get(id).state='blocked'}};
const tools=()=>createCrmTools({organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false});
const ports={authorize:async()=>{if(denied)throw Error('REVOKED')},repository:()=>repo,history:async()=>({messages:[],context:emptyOutfit()}),
 plan:async(s,input)=>recordTurn(input,{create:async()=>{modelCalls++;assert(scripted.length);return scripted.shift()}},await tools(),new AbortController().signal),
 review:async(s,t)=>reviewRecordedTurn(t,{create:async()=>{reviewCalls++;return response({safeSentenceIds:[0],preferenceDecision:'allow',reason:'all_safe'})}},await tools(),new AbortController().signal),
 saveHistory:async(s,k,input,reply)=>{if(!storedContext){history++;storedContext=reply.context}},
 claim:async()=>{if(delivery!=='unsent')return false;delivery='sending';return true},send:async(s,text)=>{sends++;assert.match(text,/Нет вариантов|нет вариантов/);assert(!text.includes('варианты ниже'));return {messageId:7}},receipt:async()=>{delivery='sent'},unknown:async()=>{delivery='unknown'}};
(async()=>{
 for(const name of ['webhook','resume','enrollment','handoff','state']){
   delete process.env.MARIPOSA_TELEGRAM_MODE;
   const route=require(`../app/api/telegram/${name}/route.ts`);
   const result=await(name==='state'?route.GET():route.POST(new Request('https://example.invalid/api/telegram/'+name,{method:'POST'})));
   assert.equal(result.status,404);
 }
 const config={enabled:true,webhookSecret:'a'.repeat(32)};
 const a=await handleTelegramUpdate(config,config.webhookSecret,binding,event,ports);assert.equal(a.status,503);assert.equal(modelCalls,2);assert.equal(reviewCalls,0);assert.equal(sends,0);
 const b=await handleTelegramUpdate(config,config.webhookSecret,binding,event,ports);assert.equal(b.outcome,'sent');assert.equal(reviewCalls,1);assert.equal(sends,1);assert.equal(history,1);
 assert.equal(storedContext.from,'2026-10-23T15:00');assert.equal(storedContext.until,'2026-10-24T12:00');assert.equal(storedContext.criteria.dress.size,'140');
 await handleTelegramUpdate(config,config.webhookSecret,binding,event,ports);assert.equal(modelCalls,2);assert.equal(reviewCalls,1);assert.equal(sends,1);
 await resumeTelegramUpdate(binding,event,'1',ports);assert.equal(reviewCalls,1);assert.equal(sends,1);
 await assert.rejects(resumeTelegramUpdate(binding,event,'missing',ports));assert.equal(modelCalls,2);
 denied=true;await assert.rejects(resumeTelegramUpdate(binding,event,'1',ports),/REVOKED/);
 const money=renderTelegramReply({message:'Проверенные варианты',cards:[{item:{name:'Платье',execution:'жёлтый',size:'140',price:{amountMinor:'15000',currency:'KZT'},available:true},from:'2026-10-23T15:00',until:'2026-10-24T12:00'}]});assert(money.replace(/\s/g,'').includes('15000'));assert(money.includes('до 12:00'));
 // Same concrete Inquiry validator and record helper, mocked transaction only.
 let records=0,record;const load=Module._load;Module._load=function(k,...a){if(k==='@/lib/inquiries/record')return {createInquiryRecord:async(tx,data)=>{records++;record=data;return {id:f.id(99)}}};return load.call(this,k,...a)};
 const {validateTelegramInquiry}=require('../lib/assistant/telegram/inquiry-draft.ts');
 const {prepareTelegramHandoff,telegramHandoff}=require('../lib/assistant/telegram/handoff.ts');
 const {telegramScope}=require('../lib/assistant/telegram/adapter.ts');const {scope}=telegramScope(binding,event);
 let savedHash,receipt;
 const tx={branch:{findFirst:async()=>({timezone:'Asia/Almaty'})},productVariant:{findMany:async()=>[]},inquiry:{count:async()=>0},$executeRaw:async()=>1};
 const hp={authorize:async()=>{},validate:validateTelegramInquiry,stage:async(s,k,h,v)=>{savedHash=h;return v(tx)},once:async(s,k,h,create)=>{assert.equal(h,savedHash);return receipt??(receipt=await create(tx))}};
 const draft={contact:'fixture@example.invalid',context:storedContext};
 const prepared=await prepareTelegramHandoff(scope,'1',draft,hp);assert.equal(records,0);assert.equal(prepared.status,'awaiting_confirmation');
 const req={updateKey:'1',draftHash:prepared.draftHash,confirmed:true,draft};
 await telegramHandoff(scope,req,hp);await telegramHandoff(scope,req,hp);assert.equal(records,1);assert.equal(record.source,'TELEGRAM');assert.equal(record.organizationId,binding.organizationId);assert.equal(record.requestedFrom.toISOString(),'2026-10-23T10:00:00.000Z');assert(!('orders'in record));
 await assert.rejects(telegramHandoff(scope,{...req,draft:{...draft,contact:'changed@example.invalid'}},hp));assert.equal(records,1);
 console.log('PASS OFFLINE integrated Telegram: disabled routes, real shared planner/tools/reviewer, deferred webhook phase, stored verdict replay, one delivery, correct dates/size/whole-unit price, history, concrete inquiry validation/confirmation/receipt. Provider/DB/Telegram simulated, no live calls.');
})().catch(e=>{console.error(e);process.exitCode=1});
