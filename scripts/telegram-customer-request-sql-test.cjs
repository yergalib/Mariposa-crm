const assert=require('node:assert/strict'),fs=require('fs'),Module=require('module');const {PGlite}=require('@electric-sql/pglite');
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
process.env.MARIPOSA_TELEGRAM_REQUESTS='confirmed-v1';
const cfg={organizationId:f.id(1),membershipId:f.id(5),branchId:f.branch,until:Date.now()+86400000,consentVersion:'v1'};
let pg,tail=Promise.resolve(),price='10000',quoteReads=0,fail=false;const sent=[];const sql=(s,v)=>({text:s.reduce((a,p,i)=>a+(i?'$'+i:'')+p,''),values:v.map(x=>x instanceof Date?x.toISOString():typeof x==='bigint'?x.toString():x)});
const tx={$queryRaw:async(s,...v)=>{const q=sql(s,v);return(await pg.query(q.text,q.values)).rows},$executeRaw:async(s,...v)=>{if(s.join('').includes('pg_advisory_xact_lock'))return 0;const q=sql(s,v);return(await pg.query(q.text,q.values)).affectedRows},branch:{findFirst:async()=>({id:cfg.branchId})},inquiry:{count:async()=>0}};
const db={...tx,$transaction:fn=>{const op=tail.then(async()=>{await pg.exec('BEGIN');try{const r=await fn(tx);await pg.exec('COMMIT');return r}catch(e){await pg.exec('ROLLBACK');throw e}});tail=op.catch(()=>{});return op}};
const load=Module._load;Module._load=function(k,...a){
 if(k==='@/lib/db')return {db};if(k==='./customer-config')return {customerConfig:()=>cfg};
 if(k==='./network')return {telegramNetwork:()=>({send:async(s,text)=>{sent.push(text);return {messageId:sent.length}}})};
 if(k==='@/lib/inquiries/channel-rental-quote')return {channelRentalQuote:async(tx,s,d)=>{quoteReads++;assert.equal(s.organizationId,cfg.organizationId);return {summary:['Verified fixture price '+price],fingerprint:price,period:{from:new Date('2026-10-23T10:00Z'),until:new Date('2026-10-24T07:00Z')},items:d.variantIds.map(id=>({id,name:'Fixture',sku:'F',size:'140',execution:null}))}}};
 if(k==='@/lib/inquiries/record')return {createInquiryRecord:async(tx,data,audit)=>{assert.equal(audit.actorMembershipId,undefined);assert.equal(data.source,'TELEGRAM');assert.ok(data.requestText.includes('Клиент:'));await pg.query('INSERT INTO fixture_inquiries(id,data) VALUES($1,$2)',[data.creationKey,JSON.stringify(data)]);if(fail)throw Error('COMMIT_FAILED');return {id:data.creationKey}}};
 return load.call(this,k,...a);
};
const {customerRequestStore}=require('../lib/assistant/telegram/customer-request-store.ts');
const {prepareChannelRequest,confirmChannelRequest}=require('../lib/inquiries/confirmed-channel-request.ts');
const scope=n=>({enabled:true,consent:true,organizationId:cfg.organizationId,membershipId:cfg.membershipId,branchId:cfg.branchId,botId:123,userId:n,chatId:n,generation:f.id(n+50),start:Date.now()-60000,until:cfg.until,principal:'fixture'+n});
(async()=>{
 pg=new PGlite();await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE assistant_provider_attempts(id uuid PRIMARY KEY);CREATE TABLE fixture_inquiries(id uuid PRIMARY KEY,data jsonb);');
 await pg.exec(fs.readFileSync('docs/sql/telegram-customer-candidate.sql','utf8'));await pg.exec(fs.readFileSync('docs/sql/telegram-customer-requests-candidate.sql','utf8'));
 for(const n of [11,12])await pg.query("INSERT INTO assistant_telegram_customers(id,organization_id,budget_membership_id,branch_id,bot_id,sender_id,chat_id,generation,enabled,consent_at,consent_version,starts_at,expires_at) VALUES($1,$2,$3,$4,123,$5,$5,$6,true,now(),$7,now()-interval '1 minute',now()+interval '1 day')",[f.id(n),cfg.organizationId,cfg.membershipId,cfg.branchId,n,f.id(n+50),'v1']);
 await pg.query("INSERT INTO assistant_telegram_customer_turns(id,binding_id,update_id,request_hash,state,envelope,history_input,history_reply) VALUES($1,$2,1,repeat('a',64),'complete','{}',$3,$4)",[f.id(90),f.id(11),JSON.stringify({messages:[{role:'user',content:'Размер ребёнка 140, жёлтый, завтра на день'}]}),JSON.stringify({message:'Подбор'})]);
 const a=customerRequestStore(scope(11),2),b=customerRequestStore(scope(12),2),draft={contact:'fixture@example.invalid',variantIds:[f.id(20)],from:'2026-10-23',until:'2026-10-24'};
 const staged=await prepareChannelRequest(draft,a);assert.equal((await prepareChannelRequest(draft,a)).id,staged.id);
 await assert.rejects(confirmChannelRequest(staged.id,true,b),/NOT_FOUND/);
 price='20000';assert.equal((await confirmChannelRequest(staged.id,true,a)).status,'changed');assert.equal((await pg.query('SELECT * FROM fixture_inquiries')).rows.length,0);price='10000';
 fail=true;await assert.rejects(confirmChannelRequest(staged.id,true,a),/COMMIT_FAILED/);assert.equal((await pg.query('SELECT * FROM fixture_inquiries')).rows.length,0);fail=false;
 const receipts=await Promise.all([confirmChannelRequest(staged.id,true,a),confirmChannelRequest(staged.id,true,a)]);assert.equal(receipts[0].inquiryId,receipts[1].inquiryId);assert.equal((await pg.query('SELECT * FROM fixture_inquiries')).rows.length,1);
 // Exercise actual Telegram command -> persisted draft -> explicit confirmation
 // -> same transaction creating Inquiry -> one delivery, with synthetic ports.
 const offered=[{variantId:f.id(20),productId:f.id(10),executionId:null,from:'2026-10-23',until:'2026-10-24'}];
 await pg.query('UPDATE assistant_telegram_customer_turns SET offered=$1 WHERE id=$2',[JSON.stringify(offered),f.id(90)]);
 const {customerRequestCommand}=require('../lib/assistant/telegram/customer-request-command.ts');
 const event=(n,text)=>({update_id:n,message:{message_id:n,date:Math.floor(Date.now()/1000),from:{id:11,is_bot:false},chat:{id:11,type:'private'},text}});
 await customerRequestCommand(scope(11),event(10,'/request 1 fixture@example.invalid'),'synthetic');assert.equal(sent.length,1);
 const confirmation=/\/confirm ([a-f0-9-]{36})/.exec(sent[0])[1];
 await customerRequestCommand(scope(11),event(11,'/confirm '+confirmation),'synthetic');assert.equal(sent.length,2);assert.match(sent[1],/сохранена/);
 await customerRequestCommand(scope(11),event(12,'/confirm '+confirmation),'synthetic');assert.equal(sent.length,2);assert.equal((await pg.query('SELECT * FROM fixture_inquiries')).rows.length,2);
 await pg.query('UPDATE assistant_telegram_customers SET enabled=false WHERE id=$1',[f.id(11)]);await assert.rejects(confirmChannelRequest(staged.id,true,a),/DENIED/);
 await pg.exec('SET ROLE anon');await assert.rejects(()=>pg.query('SELECT * FROM assistant_telegram_customer_requests'),e=>e.code==='42501');await pg.exec('RESET ROLE');
 assert.ok(quoteReads>=5);console.log('PASS actual PGlite request SQL: scoped draft, retry, changed quote, transaction rollback, concurrent confirmation one fixture inquiry, history/channel, no owner impersonation, revoked consent, RLS. Catalog/create ports synthetic; no live writes.');await pg.close();
})().catch(e=>{console.error(e);process.exitCode=1});
