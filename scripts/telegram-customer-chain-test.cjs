const assert=require('node:assert/strict'),fs=require('fs'),Module=require('module');const {PGlite}=require('@electric-sql/pglite');
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const cfg={organizationId:f.id(1),membershipId:f.id(5),branchId:f.branch,until:Date.now()+86400000,minute:3,day:30,consentVersion:'v1'};
let pg,tail=Promise.resolve();const sql=(strings,values)=>({text:strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values:values.map(v=>v instanceof Date?v.toISOString():typeof v==='bigint'?v.toString():v)});
const tx={$queryRaw:async(s,...v)=>{const q=sql(s,v);return(await pg.query(q.text,q.values)).rows},$executeRaw:async(s,...v)=>{const q=sql(s,v);return(await pg.query(q.text,q.values)).affectedRows},branch:{findFirst:async a=>a.where.id===cfg.branchId&&a.where.organizationId===cfg.organizationId?{id:cfg.branchId}:null}};
const db={...tx,$transaction:fn=>{const run=tail.then(async()=>{await pg.exec('BEGIN');try{const r=await fn(tx);await pg.exec('COMMIT');return r}catch(e){await pg.exec('ROLLBACK');throw e}});tail=run.catch(()=>{});return run}};
const load=Module._load;Module._load=function(k,...a){if(k==='@/lib/db')return {db};if(k==='./customer-config')return {customerConfig:()=>cfg};return load.call(this,k,...a)};
const {customerStore}=require('../lib/assistant/telegram/customer-store.ts'),{authorizeCustomer}=require('../lib/assistant/telegram/customer-access.ts');
const scope=n=>({enabled:true,consent:true,organizationId:cfg.organizationId,membershipId:cfg.membershipId,branchId:cfg.branchId,botId:123,userId:n,chatId:n,generation:f.id(n+50),start:Date.now()-60000,until:cfg.until,principal:'fixture'+n});

let noticeCount=0,sendCount=0,modelCalls=0,budgets=0,failModel=false,failSend=false;const providerSubjects=[],modelInputs=[],providerOptions=[];
const loader=Module._load;Module._load=function(k,...args){
 if(k==='./network')return {telegramNetwork:()=>({notice:async()=>{noticeCount++;return {messageId:noticeCount}},send:async()=>{sendCount++;if(failSend)throw Error('DELIVERY_UNCERTAIN');return {messageId:100+sendCount}}})};
 if(k==='../chat/provider-budget')return {assertProviderTurnBudget:async()=>{budgets++}};
 if(k==='../chat/provider')return {openAIProvider:(subject,options)=>({create:async body=>{providerOptions.push(options);modelCalls++;if(failModel)throw Error('PROVIDER_UNCERTAIN');providerSubjects.push(subject);const review=body.text.format.name==='conversation_boundary_review';if(!review)modelInputs.push(JSON.stringify(body.input));return {status:'completed',output:[],outputTokens:30,outputText:JSON.stringify(review?{safeSentenceIds:[0],preferenceDecision:'allow',reason:'all_safe'}:{message:'Какой размер платья нужен ребёнку?',preferenceChanges:[],factRefs:[],cardIds:[],productRefs:[]})};}})};
 return loader.call(this,k,...args);
};
// Re-import after ports are replaced; concrete SQL store + shared planner/reviewer remain real.
delete require.cache[require.resolve('../lib/assistant/telegram/customer-store.ts')];
const {customerEnvelope}=require('../lib/assistant/telegram/customer-enrollment.ts');
const {customerRuntime}=require('../lib/assistant/telegram/customer-runtime.ts');
const {handleTelegramUpdate}=require('../lib/assistant/telegram/handler.ts');
const eventDates=new Map();
const event=(user,update,text)=>({update_id:update,message:{message_id:update,date:eventDates.get(user+':'+update)??(eventDates.set(user+':'+update,Math.floor(Date.now()/1000)),eventDates.get(user+':'+update)),from:{id:user,is_bot:false},chat:{id:user,type:'private'},text}});
(async()=>{
 pg=new PGlite();await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE assistant_provider_attempts(id uuid PRIMARY KEY);');await pg.exec(fs.readFileSync('docs/sql/telegram-customer-candidate.sql','utf8'));
 const execute=tx.$executeRaw;tx.$executeRaw=async(s,...v)=>s.join('').includes('pg_advisory_xact_lock')?0:execute(s,...v);
 for(const user of [11,12]){
  assert.equal(await customerEnvelope(event(user,1,'/start'),123,'fixture'),null);
  assert.equal(await customerEnvelope(event(user,1,'/start'),123,'fixture'),null);
  assert.equal(await customerEnvelope(event(user,2,'/agree'),123,'fixture'),null);
 }
 assert.equal(noticeCount,4);assert.equal(modelCalls,0);
 // Telegram timestamps are second precision; avoid a synthetic same-second pre-binding event.
 await pg.exec("UPDATE assistant_telegram_customers SET starts_at=now()-interval '1 minute'");
 for(const user of [11,12]){
  const raw=event(user,3,user===11?'Мне нужно платье':'Ищу наряд для ребёнка');
  const accepted=await customerEnvelope(raw,123,'fixture');assert(accepted);
  const ports=customerRuntime('fixture',3,new AbortController().signal,Date.now()+24000),conf={enabled:true,webhookSecret:'a'.repeat(32)};
  assert.equal((await handleTelegramUpdate(conf,conf.webhookSecret,accepted.binding,raw,ports)).status,503);
  assert.equal((await handleTelegramUpdate(conf,conf.webhookSecret,accepted.binding,raw,ports)).outcome,'sent');
  await handleTelegramUpdate(conf,conf.webhookSecret,accepted.binding,raw,ports);
 }
 assert(providerOptions.every(o=>Number.isFinite(o.deadlineAt)&&typeof o.diagnostic==="function"));assert.equal(modelCalls,4);assert.equal(sendCount,2);assert(providerSubjects.every(s=>s.customerTurnId&&s.membershipId===cfg.membershipId));assert.notEqual(providerSubjects[0].customerTurnId,providerSubjects[2].customerTurnId);
 assert(!modelInputs[1].includes('Мне нужно платье'));assert(!modelInputs[0].includes('Ищу наряд'));
 await customerEnvelope(event(11,4,'/stop'),123,'fixture');const before=modelCalls;assert.equal(await customerEnvelope(event(11,5,'Другой цвет'),123,'fixture'),null);assert.equal(modelCalls,before);
 // A delayed old /agree cannot reactivate a stopped chat.
 await customerEnvelope(event(11,2,'/agree'),123,'fixture');assert.equal((await pg.query('SELECT enabled FROM assistant_telegram_customers WHERE sender_id=11')).rows[0].enabled,false);
 // Unknown provider outcome blocks only that chat; retry cannot pay twice.
 await customerEnvelope(event(13,1,'/agree'),123,'fixture');await pg.exec("UPDATE assistant_telegram_customers SET starts_at=now()-interval '1 minute' WHERE sender_id=13");
 let raw=event(13,2,'Здравствуйте'),acc=await customerEnvelope(raw,123,'fixture'),ports=customerRuntime('fixture',2,new AbortController().signal),conf={enabled:true,webhookSecret:'a'.repeat(32)};
 failModel=true;await assert.rejects(handleTelegramUpdate(conf,conf.webhookSecret,acc.binding,raw,ports),/PROVIDER_UNCERTAIN/);const attempted=modelCalls;
 assert.equal((await handleTelegramUpdate(conf,conf.webhookSecret,acc.binding,raw,ports)).outcome,'blocked');assert.equal(modelCalls,attempted);failModel=false;
 const noticesBefore=noticeCount;await customerEnvelope(raw,123,'fixture','failed');await customerEnvelope(raw,123,'fixture','failed');assert.equal(noticeCount,noticesBefore+1);assert.equal(modelCalls,attempted);
 const blocked=(await pg.query("SELECT state,delivery_state FROM assistant_telegram_customer_turns t JOIN assistant_telegram_customers c ON c.id=t.binding_id WHERE c.sender_id=13 AND t.update_id=2")).rows[0];assert.equal(blocked.state,'blocked');assert.equal(blocked.delivery_state,'sent');
 const {customerFailureNotice}=require('../lib/assistant/telegram/customer-notices.ts');for(const [code,notice] of Object.entries({CUSTOMER_BLOCKED:'failed',CUSTOMER_PENDING:'pending',PROVIDER_PENDING:'providerPending',CUSTOMER_DAY_LIMIT:'dayLimit',CUSTOMER_MINUTE_LIMIT:'minuteLimit',PROVIDER_BUDGET:'budget',PROVIDER_CALL_LIMIT:'callLimit'}))assert.equal(customerFailureNotice(Error(code)),notice);
 // A Telegram send/receipt uncertainty never claims a second delivery.
 await customerEnvelope(event(14,1,'/agree'),123,'fixture');await pg.exec("UPDATE assistant_telegram_customers SET starts_at=now()-interval '1 minute' WHERE sender_id=14");
 raw=event(14,2,'Добрый день');acc=await customerEnvelope(raw,123,'fixture');ports=customerRuntime('fixture',2,new AbortController().signal);
 await handleTelegramUpdate(conf,conf.webhookSecret,acc.binding,raw,ports);failSend=true;assert.equal((await handleTelegramUpdate(conf,conf.webhookSecret,acc.binding,raw,ports)).outcome,'unknown');const sent=sendCount;
 failSend=false;await handleTelegramUpdate(conf,conf.webhookSecret,acc.binding,raw,ports);assert.equal(sendCount,sent);
 console.log('PASS OFFLINE complete customer path: consent notice, agree, two isolated real SQL histories, shared planner/reviewer with simulated provider and sender, one send/update, budget attribution, stop, late consent no reactivation. No live calls.');await pg.close();
})().catch(e=>{console.error(e);process.exitCode=1});
