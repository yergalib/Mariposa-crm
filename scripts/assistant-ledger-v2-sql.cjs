// Embedded PostgreSQL/WASM, memory only. No credentials, sockets or live database.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();const org=crypto.randomUUID(),member=crypto.randomUUID(),old=crypto.randomUUID(),newId=crypto.randomUUID();
const checks=[];async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name)}
(async()=>{
 await db.exec('CREATE TABLE organizations(id uuid PRIMARY KEY); CREATE TABLE organization_memberships(id uuid PRIMARY KEY);');
 await db.query('INSERT INTO organizations VALUES ($1)',[org]);await db.query('INSERT INTO organization_memberships VALUES ($1)',[member]);
 await db.exec(fs.readFileSync('prisma/migrations/20261010200000_assistant_provider_budget/migration.sql','utf8'));
 await db.query("INSERT INTO assistant_provider_attempts VALUES ($1,$2,$3,'2026-10-21T18:59:59Z','2026-10-21T18:59:59Z',1000,1400)",[old,org,member]);
 const before=(await db.query('SELECT * FROM assistant_provider_attempts')).rows[0];
 const sql=fs.readFileSync('docs/sql/assistant-provider-ledger-v2.candidate.sql','utf8');
 await check('Additive migration preserves legacy data and RLS; no invented model',async()=>{
  await db.exec(sql);const row=(await db.query('SELECT * FROM assistant_provider_attempts')).rows[0];for(const k of Object.keys(before))assert.deepEqual(row[k],before[k]);
  for(const k of ['model','pricing_version','reserved_nano','actual_usage','actual_cost_nano','usage_state'])assert.equal(row[k],null);
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='assistant_provider_attempts'::regclass")).rows[0].relrowsecurity,true);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE tablename='assistant_provider_attempts'")).rows[0].n,0);
 });
 const insert="INSERT INTO assistant_provider_attempts(id,organization_id,membership_id,created_at,lease_until,input_bytes,output_token_cap,model,pricing_version,call_kind,reserved_nano,usage_state) VALUES($1,$2,$3,$4,'2026-10-25T19:00:00Z',1000,1400,$5,$6,'planning',$7,'reserved')";
 await db.query(insert,[newId,org,member,'2026-10-21T18:59:59Z','gpt-6.1-sol','sol-v1','369512000']);
 await check('Immutable provenance and unknown lease; invalid/partial receipt denied',async()=>{
  for(const assignment of ["model='other'","reserved_nano=1","pricing_version='other'","input_bytes=2000","lease_until=now()","usage_state='verified'"]){await assert.rejects(db.query('UPDATE assistant_provider_attempts SET '+assignment+' WHERE id=$1',[newId]));}
  await assert.rejects(db.query("UPDATE assistant_provider_attempts SET model='gpt-6-luna' WHERE id=$1",[old]));
 });
 const usage={inputTokens:100,outputTokens:10,cachedInputTokens:0,cacheWriteTokens:0,reasoningTokens:0};
 const finish="UPDATE assistant_provider_attempts SET usage_state='verified',actual_usage=$2::jsonb,actual_cost_nano=300000,provider_response_id='resp_test',lease_until='2026-10-21T18:59:59Z' WHERE id=$1 AND usage_state='reserved'";
 await check('Receipt persistence is idempotent and never refunds reserve',async()=>{
  assert.equal((await db.query(finish,[newId,JSON.stringify(usage)])).affectedRows,1);
  assert.equal((await db.query(finish,[newId,JSON.stringify(usage)])).affectedRows,0);
  assert.equal((await db.query('SELECT reserved_nano::text AS n FROM assistant_provider_attempts WHERE id=$1',[newId])).rows[0].n,'369512000');
  for(const assignment of ["actual_cost_nano=0","actual_usage='{}'::jsonb","usage_state='reserved'","lease_until=now()"]){await assert.rejects(db.query('UPDATE assistant_provider_attempts SET '+assignment+' WHERE id=$1',[newId]));}
 });
 const luna=crypto.randomUUID();await db.query(insert,[luna,org,member,'2026-10-21T18:59:59Z','gpt-6-luna','luna-v1','18475600']);
 await check('Mixed models sum immutable reserves; legacy is not discounted; Almaty boundary retains records',async()=>{
  const q="SELECT COALESCE(sum(COALESCE(reserved_nano,CASE WHEN output_token_cap=300 THEN 47300000::bigint ELSE 369512000::bigint END)) FILTER(WHERE created_at>=date_trunc('day',$1::timestamptz AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty'),0)::text AS n,count(*) FILTER(WHERE usage_state='reserved')::int AS unknown FROM assistant_provider_attempts";
  const a=(await db.query(q,['2026-10-21T18:59:59.999Z'])).rows[0];assert.equal(a.n,'757499600');assert.equal(a.unknown,1);
  const b=(await db.query(q,['2026-10-21T19:00:00Z'])).rows[0];assert.equal(b.n,'0');assert.equal(b.unknown,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM assistant_provider_attempts')).rows[0].n,3);
 });
 await check('A provider receipt cannot settle another attempt; migration replay fails atomically',async()=>{
  await assert.rejects(db.query(finish,[luna,JSON.stringify(usage)]));assert.equal((await db.query('SELECT usage_state FROM assistant_provider_attempts WHERE id=$1',[luna])).rows[0].usage_state,'reserved');
  await assert.rejects(db.exec(sql));await db.exec('ROLLBACK');assert.equal((await db.query('SELECT count(*)::int AS n FROM assistant_provider_attempts')).rows[0].n,3);
 });
 const report={status:'PASS',engine:'PGlite in-memory PostgreSQL',liveDatabase:false,providerCalls:0,checks};fs.writeFileSync('docs/evidence/assistant-ledger-v2-sql.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await db.close();
})().catch(async e=>{console.error(e);await db.close();process.exitCode=1});
