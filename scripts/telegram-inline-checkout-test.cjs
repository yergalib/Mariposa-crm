const assert=require('node:assert/strict'),fs=require('fs'),Module=require('module');const {PGlite}=require('@electric-sql/pglite');
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};process.env.MARIPOSA_TELEGRAM_REQUESTS='confirmed-v1';
const cfg={organizationId:f.id(1),membershipId:f.id(5),branchId:f.branch,until:Date.now()+86400000,consentVersion:'v1',minute:10};
let pg,tail=Promise.resolve(),price='10000',sendFailure=false;const sends=[],acks=[];
const sql=(s,v)=>({text:s.reduce((a,p,i)=>a+(i?'$'+i:'')+p,''),values:v.map(x=>x instanceof Date?x.toISOString():typeof x==='bigint'?x.toString():x)});
const tx={$queryRaw:async(s,...v)=>{const q=sql(s,v);return(await pg.query(q.text,q.values)).rows},$executeRaw:async(s,...v)=>{if(s.join('').includes('pg_advisory_xact_lock'))return 0;const q=sql(s,v);return(await pg.query(q.text,q.values)).affectedRows},branch:{findFirst:async()=>({id:cfg.branchId})},inquiry:{count:async()=>0}};
const db={...tx,$transaction:fn=>{const op=tail.then(async()=>{await pg.exec('BEGIN');try{const r=await fn(tx);await pg.exec('COMMIT');return r}catch(e){await pg.exec('ROLLBACK');throw e}});tail=op.catch(()=>{});return op}};
const load=Module._load;Module._load=function(k,...a){
 if(k==='@/lib/db')return {db};if(k==='./customer-config')return {customerConfig:()=>cfg};
 if(k==='./network')return {telegramNetwork:()=>({send:async(s,text,keyboard)=>{sends.push({text,keyboard});if(sendFailure)throw Error('UNKNOWN_SEND');return {messageId:200+sends.length}},callbackReceipt:async(id,text)=>{acks.push({id,text})}})};
 if(k==='@/lib/inquiries/channel-rental-quote')return {channelRentalQuote:async(tx,s,d)=>({summary:['Verified price '+price],fingerprint:price+':'+d.variantIds.join(),period:{from:new Date('2026-10-23T10:00Z'),until:new Date('2026-10-24T07:00Z')},items:d.variantIds.map(id=>({id,name:'Fixture',sku:'F',size:'140',execution:null}))})};
 if(k==='@/lib/inquiries/record')return {createInquiryRecord:async(tx,data,audit)=>{assert.equal(audit.actorMembershipId,undefined);await pg.query('INSERT INTO fixture_inquiries(id,data) VALUES($1,$2)',[data.creationKey,JSON.stringify(data)]);return {id:data.creationKey}}};
 return load.call(this,k,...a);
};
const {handleCustomerCallback,customerContactMessage,invalidateCustomerCheckout}=require('../lib/assistant/telegram/customer-checkout.ts');
const {selectionButtons,confirmationButtons}=require('../lib/assistant/telegram/checkout-buttons.ts');
const scope=n=>({enabled:true,consent:true,organizationId:cfg.organizationId,membershipId:cfg.membershipId,branchId:cfg.branchId,botId:123,userId:n,chatId:n,generation:f.id(n+50),start:Date.now()-60000,until:cfg.until,principal:'fixture'+n});
const event=(n,text,user=11)=>({update_id:n,message:{message_id:n,date:Math.floor(Date.now()/1000),from:{id:user,is_bot:false},chat:{id:user,type:'private'},text}});
const cb=(n,data,messageId=100,user=11)=>({update_id:n,callback_query:{id:'callback'+n,from:{id:user,is_bot:false},data,message:{message_id:messageId,from:{id:123,is_bot:true},chat:{id:user,type:'private'}}}});
const count=async()=>Number((await pg.query('SELECT count(*) n FROM fixture_inquiries')).rows[0].n);
const flow=async()=> (await pg.query('SELECT * FROM assistant_telegram_customer_checkout WHERE binding_id=$1',[f.id(11)])).rows[0];
const draft=async()=> (await pg.query('SELECT * FROM assistant_telegram_customer_requests WHERE id=$1',[(await flow()).request_id])).rows[0];
(async()=>{
 pg=new PGlite();await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE assistant_provider_attempts(id uuid PRIMARY KEY);CREATE TABLE fixture_inquiries(id uuid PRIMARY KEY,data jsonb);');await pg.exec(fs.readFileSync('docs/sql/telegram-customer-candidate.sql','utf8'));await pg.exec(fs.readFileSync('docs/sql/telegram-customer-requests-candidate.sql','utf8'));
 for(const n of [11,12])await pg.query("INSERT INTO assistant_telegram_customers(id,organization_id,budget_membership_id,branch_id,bot_id,sender_id,chat_id,generation,enabled,consent_at,consent_version,starts_at,expires_at) VALUES($1,$2,$3,$4,123,$5,$5,$6,true,now(),$7,now()-interval '1 minute',$8)",[f.id(n),cfg.organizationId,cfg.membershipId,cfg.branchId,n,f.id(n+50),'v1',new Date(cfg.until).toISOString()]);
 const offered=[20,21].map(n=>({variantId:f.id(n),productId:f.id(n+10),executionId:null,from:'2026-10-23',until:'2026-10-24'}));
 await pg.query("INSERT INTO assistant_telegram_customer_turns(id,binding_id,update_id,request_hash,state,envelope,history_input,history_reply,offered) VALUES($1,$2,1,repeat('a',64),'complete','{}',$3,$4,$5)",[f.id(90),f.id(11),JSON.stringify({messages:[{role:'user',content:'Размер ребёнка 140, жёлтый, завтра на день'}]}),JSON.stringify({message:'Подбор'}),JSON.stringify(offered)]);
 await pg.query("INSERT INTO assistant_telegram_customer_delivery_parts(turn_id,part,content_hash,state,telegram_message_id) VALUES($1,0,'fixture','sent',100)",[f.id(90)]);
 const select=selectionButtons(f.id(90),2).inline_keyboard[0][0].callback_data;
 await handleCustomerCallback(cb(2,'c:not-a-uuid'),123,'synthetic');assert.equal(sends.length,0);
 const wrongBot=cb(3,select);wrongBot.callback_query.message.from.id=999;await handleCustomerCallback(wrongBot,123,'synthetic');assert.equal(sends.length,0);
 for(const row of selectionButtons(f.id(90),9).inline_keyboard)for(const b of row)assert.ok(Buffer.byteLength(b.callback_data)<=64);
 await handleCustomerCallback(cb(10,select,100,12),123,'synthetic');assert.equal(sends.length,0);assert.equal(await count(),0);
 await handleCustomerCallback(cb(11,select,999),123,'synthetic');assert.equal(sends.length,0);
 await handleCustomerCallback(cb(12,select),123,'synthetic');assert.equal(sends.length,1);assert.ok(sends[0].keyboard);assert.ok(!sends[0].text.includes('/request'));
 await handleCustomerCallback(cb(12,select),123,'synthetic');assert.equal(sends.length,1);
 assert.equal(await customerContactMessage(scope(11),event(13,'fixture@example.invalid'),'synthetic'),true);
 assert.equal(sends.length,2);assert.ok(!sends[1].text.includes('/confirm'));const first=await draft();assert.ok(first.selection_version);
 await customerContactMessage(scope(11),event(13,'fixture@example.invalid'),'synthetic');assert.equal(sends.length,2);
 const confirm=confirmationButtons(first.id).inline_keyboard[0][0].callback_data;
 await handleCustomerCallback(cb(14,confirm,202,12),123,'synthetic');assert.equal(await count(),0);
 await handleCustomerCallback(cb(15,confirm,999),123,'synthetic');assert.equal(await count(),0);
 // Changed price permanently invalidates this revision, even if price returns.
 price='20000';await handleCustomerCallback(cb(16,confirm,202),123,'synthetic');assert.equal(await count(),0);price='10000';await handleCustomerCallback(cb(17,confirm,202),123,'synthetic');assert.equal(await count(),0);
 await handleCustomerCallback(cb(18,select),123,'synthetic');await customerContactMessage(scope(11),event(19,'fixture@example.invalid'),'synthetic');const second=await draft();assert.notEqual(second.id,first.id);
 const receiptMessage=200+sends.length,confirmSecond=confirmationButtons(second.id).inline_keyboard[0][0].callback_data;
 await Promise.all([handleCustomerCallback(cb(20,confirmSecond,receiptMessage),123,'synthetic'),handleCustomerCallback(cb(21,confirmSecond,receiptMessage),123,'synthetic')]);assert.equal(await count(),1);
 const delivered=sends.length;await handleCustomerCallback(cb(22,confirmSecond,receiptMessage),123,'synthetic');assert.equal(await count(),1);assert.equal(sends.length,delivered);
 // A different selected product invalidates old uncommitted revisions. New
 // wishes invalidate before model admission, even when no model request follows.
 await handleCustomerCallback(cb(23,`s:${f.id(90)}:1`),123,'synthetic');await customerContactMessage(scope(11),event(24,'fixture@example.invalid'),'synthetic');const third=await draft(),thirdMessage=200+sends.length;
 await invalidateCustomerCheckout(scope(11),event(25,'Теперь на два дня'));
 await handleCustomerCallback(cb(26,`c:${third.id}`,thirdMessage),123,'synthetic');assert.equal(await count(),1);
 // A process failure after claiming contact prompt is not replayed.
 const staleSends=sends.length;await handleCustomerCallback(cb(27,select),123,'synthetic');assert.equal(sends.length,staleSends);
 await pg.query("INSERT INTO assistant_telegram_customer_turns(id,binding_id,update_id,request_hash,state,envelope,history_input,history_reply,offered) SELECT $1,binding_id,25,request_hash,state,envelope,history_input,history_reply,offered FROM assistant_telegram_customer_turns WHERE id=$2",[f.id(91),f.id(90)]);
 await pg.query("INSERT INTO assistant_telegram_customer_delivery_parts(turn_id,part,content_hash,state,telegram_message_id) VALUES($1,0,'fixture','sent',101)",[f.id(91)]);
 sendFailure=true;await handleCustomerCallback(cb(28,`s:${f.id(91)}:0`,101),123,'synthetic');const before=sends.length;await handleCustomerCallback(cb(29,`s:${f.id(91)}:0`,101),123,'synthetic');assert.equal(sends.length,before);assert.equal((await flow()).prompt_state,'unknown');sendFailure=false;
 await pg.query('UPDATE assistant_telegram_customer_checkout SET expires_at=now()-interval \'1 second\' WHERE binding_id=$1',[f.id(11)]);await handleCustomerCallback(cb(29,`c:${third.id}`,thirdMessage),123,'synthetic');assert.equal(await count(),1);
 await pg.query("UPDATE assistant_telegram_customer_quotas SET count=10 WHERE principal_id=$1 AND bucket LIKE 'checkout:%'",[f.id(11)]);const limited=sends.length;await handleCustomerCallback(cb(30,`s:${f.id(91)}:1`,101),123,'synthetic');assert.equal(sends.length,limited);assert.ok(acks.at(-1).text.includes('лимит'));
 // A different product selection invalidates an uncommitted draft, independently
 // of price. Cancel is scoped to its exact summary/version/message too.
 await pg.query("INSERT INTO assistant_telegram_customer_turns(id,binding_id,update_id,request_hash,state,envelope,history_input,history_reply,offered) SELECT $1,$2,1,request_hash,state,envelope,history_input,history_reply,offered FROM assistant_telegram_customer_turns WHERE id=$3",[f.id(92),f.id(12),f.id(90)]);
 await pg.query("INSERT INTO assistant_telegram_customer_delivery_parts(turn_id,part,content_hash,state,telegram_message_id) VALUES($1,0,'fixture','sent',102)",[f.id(92)]);
 await handleCustomerCallback(cb(40,`s:${f.id(92)}:0`,102,12),123,'synthetic');await customerContactMessage(scope(12),event(41,'second@example.invalid',12),'synthetic');
 const former=(await pg.query('SELECT r.* FROM assistant_telegram_customer_requests r JOIN assistant_telegram_customer_checkout c ON c.request_id=r.id WHERE c.binding_id=$1',[f.id(12)])).rows[0],formerMessage=200+sends.length;
 await handleCustomerCallback(cb(42,`s:${f.id(92)}:1`,102,12),123,'synthetic');await handleCustomerCallback(cb(43,`c:${former.id}`,formerMessage,12),123,'synthetic');assert.equal(await count(),1);
 await customerContactMessage(scope(12),event(44,'second@example.invalid',12),'synthetic');const replacement=(await pg.query('SELECT r.* FROM assistant_telegram_customer_requests r JOIN assistant_telegram_customer_checkout c ON c.request_id=r.id WHERE c.binding_id=$1',[f.id(12)])).rows[0],replacementMessage=200+sends.length;
 assert.notEqual(former.selection_version,replacement.selection_version);
 await handleCustomerCallback(cb(45,`r:${replacement.id}`,replacementMessage,12),123,'synthetic');await handleCustomerCallback(cb(46,`c:${replacement.id}`,replacementMessage,12),123,'synthetic');assert.equal(await count(),1);
 await pg.exec('SET ROLE anon');await assert.rejects(()=>pg.query('SELECT * FROM assistant_telegram_customer_checkout'),e=>e.code==='42501');await pg.exec('RESET ROLE');
 console.log('PASS offline inline checkout actual SQL: buttons→contact→draft→confirmation→one Inquiry; wrong chat/message, stale version, price restoration, repeated/concurrent callbacks, ordinary-message invalidation before model admission, unknown prompt no replay, expiry, private table. Provider/Telegram/business record ports synthetic.');await pg.close();
})().catch(e=>{console.error(e);process.exitCode=1});
