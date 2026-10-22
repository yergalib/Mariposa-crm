const assert=require('node:assert/strict'),fs=require('fs'),Module=require('module');const {PGlite}=require('@electric-sql/pglite');
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const cfg={organizationId:f.id(1),membershipId:f.id(5),branchId:f.branch,until:Date.now()+86400000,minute:3,day:30,consentVersion:'v1'};
let pg,tail=Promise.resolve();const sql=(strings,values)=>({text:strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values:values.map(v=>v instanceof Date?v.toISOString():typeof v==='bigint'?v.toString():v)});
const tx={$queryRaw:async(s,...v)=>{const q=sql(s,v);return(await pg.query(q.text,q.values)).rows},$executeRaw:async(s,...v)=>{const q=sql(s,v);return(await pg.query(q.text,q.values)).affectedRows},branch:{findFirst:async a=>a.where.id===cfg.branchId&&a.where.organizationId===cfg.organizationId?{id:cfg.branchId}:null}};
const db={...tx,$transaction:fn=>{const run=tail.then(async()=>{await pg.exec('BEGIN');try{const r=await fn(tx);await pg.exec('COMMIT');return r}catch(e){await pg.exec('ROLLBACK');throw e}});tail=run.catch(()=>{});return run}};
const load=Module._load;Module._load=function(k,...a){if(k==='@/lib/db')return {db};if(k==='./customer-config')return {customerConfig:()=>cfg};return load.call(this,k,...a)};
const {customerStore}=require('../lib/assistant/telegram/customer-store.ts'),{authorizeCustomer}=require('../lib/assistant/telegram/customer-access.ts');
const scope=n=>({enabled:true,consent:true,organizationId:cfg.organizationId,membershipId:cfg.membershipId,branchId:cfg.branchId,botId:123,userId:n,chatId:n,generation:f.id(n+50),start:Date.now()-60000,until:cfg.until,principal:'fixture'+n});
(async()=>{
 pg=new PGlite();await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE assistant_provider_attempts(id uuid PRIMARY KEY);');await pg.exec(fs.readFileSync('docs/sql/telegram-customer-candidate.sql','utf8'));
 for(const n of [11,12])await pg.query('INSERT INTO assistant_telegram_customers(id,organization_id,budget_membership_id,branch_id,bot_id,sender_id,chat_id,generation,enabled,consent_at,consent_version,starts_at,expires_at) VALUES($1,$2,$3,$4,123,$5,$5,$6,true,now(),$7,now()-interval \'1 minute\',now()+interval \'1 day\')',[f.id(n),cfg.organizationId,cfg.membershipId,cfg.branchId,n,f.id(n+50),'v1']);
 const store=customerStore(authorizeCustomer,async()=>{}),a=scope(11),b=scope(12),ra=store.repository(a,{}),rb=store.repository(b,{}),hash='a'.repeat(64);
 const claims=await Promise.all([ra.begin('1',hash),ra.begin('1',hash)]);assert.equal(claims.filter(x=>x.created).length,1);const aid=claims[0].row.id;
 const bid=(await rb.begin('1',hash)).row.id;assert.notEqual(aid,bid);assert.equal(await rb.read(aid),null);await assert.rejects(ra.begin('1','b'.repeat(64)),/conflict/);await assert.rejects(ra.begin('2',hash),/CUSTOMER_PENDING/);
 await assert.rejects(store.repository({...a,organizationId:f.id(99)},{}).read(aid),/unavailable|DENIED/);
 const input={syntheticOnly:true,branchId:f.branch,messages:[{role:'user',content:'Размер 110'}]},candidate={kind:'review',input,tape:[],calendarNow:Date.now(),policy:'fixture'};
 await ra.stage(aid,hash,candidate);const reviews=await Promise.all([ra.claimReview(aid),ra.claimReview(aid)]);assert.equal(reviews.filter(Boolean).length,1);
 await ra.complete(aid,{kind:'complete',source:candidate,reply:{message:'Какой цвет?',cards:[]}});await store.saveHistory(a,'1',input,{message:'Какой цвет?',cards:[]});assert.equal((await store.history(b)).messages.length,0);assert.equal((await store.history(a)).messages.at(-1).content,'Какой цвет?');
 const sends=await Promise.all([store.claim(a,'1'),store.claim(a,'1')]);assert.equal(sends.filter(Boolean).length,1);await store.unknown(a,'1');assert.equal(await store.claim(a,'1'),false);await assert.rejects(store.receipt(a,'1',7),/unconfirmed/);
 // Unknown delivery has saved history, so another turn is allowed; no resend.
 const next=await ra.begin('2',hash);await ra.block(next.row.id);await assert.rejects(ra.begin('3',hash),/CUSTOMER_BLOCKED/);
 // Durable quota rollback: failed daily admission cannot leave a minute increment.
 await pg.query("UPDATE assistant_telegram_customers SET enabled=false WHERE id=$1",[f.id(12)]);await assert.rejects(rb.read(bid),/unavailable|DENIED/);await pg.query("UPDATE assistant_telegram_customers SET enabled=true WHERE id=$1",[f.id(12)]);
 await pg.query("UPDATE assistant_telegram_customer_turns SET state='complete',history_input='{}',history_reply='{}' WHERE id=$1",[bid]);
 const day='d:'+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());await pg.query('UPDATE assistant_telegram_customer_quotas SET count=30 WHERE principal_id=$1 AND bucket=$2',[f.id(12),day]);
 const before=await pg.query('SELECT bucket,count FROM assistant_telegram_customer_quotas WHERE principal_id=$1 ORDER BY bucket',[f.id(12)]);await assert.rejects(rb.begin('2',hash),/CUSTOMER_DAY_LIMIT/);assert.deepEqual((await pg.query('SELECT bucket,count FROM assistant_telegram_customer_quotas WHERE principal_id=$1 ORDER BY bucket',[f.id(12)])).rows,before.rows);
 await pg.query('INSERT INTO assistant_provider_attempts(id,telegram_customer_turn_id) VALUES($1,$2)',[f.id(88),aid]);await assert.rejects(()=>pg.query('UPDATE assistant_provider_attempts SET telegram_customer_turn_id=$1 WHERE id=$2',[bid,f.id(88)]),/immutable/);
 await pg.exec('SET ROLE anon');await assert.rejects(()=>pg.query('SELECT * FROM assistant_telegram_customers'),e=>e.code==='42501');await pg.exec('RESET ROLE');
 console.log('PASS isolated PGlite real customer store: two chats, tenant isolation, same update once, active message, quota rollback, revoked consent, CAS review/delivery, unknown no replay, history isolation, private tables. Single connection serializes tx; no live DB/network/model.');await pg.close();
})().catch(e=>{console.error(e);process.exitCode=1});
