// In-memory actual query/production projection; no network.
const assert=require('assert/strict'),fs=require('fs'),ts=require('typescript'),vm=require('vm'),{PGlite}=require('@electric-sql/pglite'),crypto=require('crypto');
const m={exports:{}};vm.runInNewContext('(function(require,module,exports){'+ts.transpileModule(fs.readFileSync('lib/assistant/chat/settled-budget.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'})')(()=>require('../lib/assistant/chat/ledger-pricing.ts'),m,m.exports);const calc=m.exports.settledDailyDebit;
const src=fs.readFileSync('lib/assistant/chat/provider-budget.ts','utf8'),begin=src.indexOf('`SELECT');let params=[];const org=crypto.randomUUID(),member=crypto.randomUUID();
const values={start:new Date('2026-10-20T19:00Z'),until:new Date('2026-10-25T19:00Z'),legacy:new Date('2026-10-21T19:00Z'),'scope.organizationId':org,'scope.membershipId':member};
const q=src.slice(begin+1,src.indexOf('`;',begin)).replace(/\$\{([^}]+)\}/g,(_,key)=>{params.push(values[key]);return '$'+params.length});
const db=new PGlite(),id=crypto.randomUUID(),rate='gpt-6.1-sol:2026-10-21:standard:2.00:0.10:2.50:10.00',usage={inputTokens:100,outputTokens:10,cachedInputTokens:0,cacheWriteTokens:0,reasoningTokens:5};
const read=async tx=>{const u=(await tx.query(q,params)).rows[0];return {...u,debit:calc(BigInt(u.reserved),u.receipts)}};
(async()=>{
 await db.exec('CREATE TABLE organizations(id uuid primary key);CREATE TABLE organization_memberships(id uuid primary key);CREATE TABLE assistant_retained_unknown(attempt_id uuid,retained_nano bigint,reason text);');await db.query('INSERT INTO organizations VALUES($1)',[org]);await db.query('INSERT INTO organization_memberships VALUES($1)',[member]);await db.exec(fs.readFileSync('prisma/migrations/20261010200000_assistant_provider_budget/migration.sql','utf8'));await db.exec(fs.readFileSync('docs/sql/assistant-provider-ledger-v2.candidate.sql','utf8'));
 const insert=async(tx,key)=>tx.query("INSERT INTO assistant_provider_attempts(id,organization_id,membership_id,created_at,lease_until,input_bytes,output_token_cap,model,pricing_version,call_kind,reserved_nano,usage_state) VALUES($1,$2,$3,now(),'2026-10-25T19:00Z',100,1400,'gpt-6.1-sol',$4,'planning',369512000,'reserved')",[key,org,member,rate]);await insert(db,id);
 assert.equal((await read(db)).debit,369512000n);
 const lock=tx=>tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['assistant-provider:'+org]);
 const settle=()=>db.transaction(async tx=>{await lock(tx);return tx.query("UPDATE assistant_provider_attempts SET usage_state='verified',actual_usage=$2::jsonb,actual_cost_nano=300000,provider_response_id='resp_settlement_test',lease_until=now() WHERE id=$1 AND usage_state='reserved'",[id,JSON.stringify(usage)])});
 const admit=()=>db.transaction(async tx=>{await lock(tx);const u=await read(tx);if(BigInt(u.active)>0n||u.debit+369512000n>370000000n)return false;await insert(tx,crypto.randomUUID());return true});
 const race=await Promise.all([settle(),admit(),admit()]);assert.equal(race[0].affectedRows,1);assert.deepEqual(race.slice(1),[true,false]);assert.equal((await settle()).affectedRows,0);
 const u=await read(db);assert.equal(u.debit,369812000n);assert.equal(BigInt(u.reserved),739024000n);assert.equal(BigInt(u.active),1n);
 const receipt=u.receipts[0];
 const cached={...receipt,responseId:'resp_cached',cost:'267000',usage:{inputTokens:100,outputTokens:10,cachedInputTokens:20,cacheWriteTokens:10,reasoningTokens:5}};
 const luna={...cached,responseId:'resp_luna',model:'gpt-6-luna',pricingVersion:'gpt-6-luna:2026-10-20:standard:0.10:0.01:0.125:0.50',cost:'13450'};
 assert.equal(calc(739024000n,[cached,luna]),280450n);
 assert.equal(calc(369512000n,[]),369512000n,'legacy/unknown without verified receipt retained');
for(const patch of [{cost:'0'},{pricingVersion:'future'},{responseId:'invalid'},{usage:{...usage,reasoningTokens:11}}])assert.throws(()=>calc(369512000n,[{...receipt,...patch}]));assert.throws(()=>calc(739024000n,[receipt,receipt]));
 assert.deepEqual((await db.query('SELECT reserved_nano::text reserve,actual_cost_nano::text cost FROM assistant_provider_attempts WHERE id=$1',[id])).rows[0],{reserve:'369512000',cost:'300000'});
 const base=Date.parse('2026-10-21T19:00Z'),boundary="SELECT (date_trunc('day',$1::timestamptz AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty')::text AS day";assert.notEqual((await db.query(boundary,[new Date(base-1)])).rows[0].day,(await db.query(boundary,[new Date(base)])).rows[0].day);
 console.log('PASS shared admission SQL/production projection, concurrent settlement/admission, active reservation, immutable reserve, idempotent receipt, invalid tariff/usage/duplicate rejection, Almaty boundary. PGlite only.');await db.close();
})().catch(async e=>{console.error(e);await db.close();process.exitCode=1});
