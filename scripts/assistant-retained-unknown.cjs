// Actual SQL on in-memory PostgreSQL. No live writes/provider calls.
const assert=require('node:assert/strict'),fs=require('fs'),{PGlite}=require('@electric-sql/pglite');
const db=new PGlite(),id='a7d2c6a5-affb-4ec2-a66f-4a765837db99',org='2157bde1-1994-465b-9f80-e1b740ee3cb1',member='c580c434-53c7-4f37-a388-da443c4e426e';
const migration=fs.readFileSync('docs/sql/assistant-one-unknown-retained.sql','utf8');
const source=fs.readFileSync('lib/assistant/chat/provider-budget.ts','utf8');let i=0;
const query=source.slice(source.indexOf('`SELECT')+1,source.indexOf('`;\n  return usage')).replace(/\$\{[^}]+\}/g,()=>'$'+(++i));
const params=['2026-10-20T19:00Z','2026-10-20T19:00Z','2026-10-20T19:00Z','2026-10-21T19:00Z','2026-10-20T19:00Z','2026-10-25T19:00Z',org,member];
(async()=>{
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE organizations(id uuid primary key); CREATE TABLE organization_memberships(id uuid primary key);');
 await db.query('INSERT INTO organizations VALUES($1)',[org]);await db.query('INSERT INTO organization_memberships VALUES($1)',[member]);
 await db.exec(fs.readFileSync('prisma/migrations/20261010200000_assistant_provider_budget/migration.sql','utf8'));
 await db.exec(fs.readFileSync('docs/sql/assistant-provider-ledger-v2.candidate.sql','utf8'));
 await db.query("INSERT INTO assistant_provider_attempts(id,organization_id,membership_id,created_at,lease_until,input_bytes,output_token_cap,model,pricing_version,call_kind,reserved_nano,usage_state) VALUES($1,$2,$3,'2026-10-21T19:07:58.148Z','2026-10-25T19:00Z',5743,300,'gpt-6.1-sol','gpt-6.1-sol:2026-10-21:standard:2.00:0.10:2.50:10.00','review',47300000,'reserved')",[id,org,member]);
 const before=(await db.query('SELECT * FROM assistant_provider_attempts')).rows;
 await db.exec(migration);await db.exec(migration);
 assert.deepEqual((await db.query('SELECT * FROM assistant_provider_attempts')).rows,before);
 assert.equal((await db.query('SELECT count(*)::int n FROM assistant_retained_unknown')).rows[0].n,1);
 assert.equal(Number((await db.query(query,params)).rows[0].active),0);
 for(const sql of ["UPDATE assistant_retained_unknown SET retained_nano=1","DELETE FROM assistant_retained_unknown"]){await assert.rejects(db.exec(sql));}
 await assert.rejects(db.exec("INSERT INTO assistant_retained_unknown VALUES('00000000-0000-0000-0000-000000000001',47300000,'owner_approved_retained_unknown_20261021',now())"));
 // New unknown is never excepted: two serialized transactions admit only one.
 const insert="INSERT INTO assistant_provider_attempts SELECT '00000000-0000-0000-0000-000000000002',organization_id,membership_id,now(),'2026-10-25T19:00Z',input_bytes,output_token_cap,model,pricing_version,call_kind,reserved_nano,usage_state,actual_usage,actual_cost_nano,provider_response_id FROM assistant_provider_attempts WHERE id=$1";
 const admission=()=>db.transaction(async tx=>{await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['assistant-provider:'+org]);if(Number((await tx.query(query,params)).rows[0].active))return false;await tx.query(insert,[id]);return true});
 assert.deepEqual(await Promise.all([admission(),admission()]),[true,false]);
 const u=(await db.query(query,params)).rows[0];assert.equal(Number(u.active),1);
 assert.equal((await db.query('SELECT sum(reserved_nano)::text total FROM assistant_provider_attempts')).rows[0].total,'94600000');
 assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='assistant_retained_unknown'::regclass")).rows[0].relrowsecurity,true);
 assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE tablename='assistant_retained_unknown'")).rows[0].n,0);
 assert(source.includes("pg_advisory_xact_lock"));
 console.log('PASS migration/replay, unchanged original, exact immutable marker, actual admission SQL, concurrent admission, retained reserve, RLS/no policies; in-memory only');await db.close();
})().catch(async e=>{console.error(e);await db.close();process.exitCode=1});
