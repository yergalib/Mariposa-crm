// Prototype orchestration plus real candidate DDL on in-memory PostgreSQL.
// No live provider, database, session or credentials.
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),{PGlite}=require('@electric-sql/pglite');
const loaded={exports:{}};vm.runInNewContext('(function(exports){'+ts.transpileModule(fs.readFileSync('lib/assistant/chat/review-continuation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'})',{Date})(loaded.exports);
const {prepareContinuation,finishContinuation}=loaded.exports;
let row=null,plans=0,reviews=0,clock=1000;
const repo={
 begin:async(key,hash)=>{if(row)return{created:false,row:structuredClone(row)};row={id:key,requestHash:hash,state:'planning',candidate:null,result:null,expiresAt:clock+600000};return{created:true,row:structuredClone(row)}},
 read:async id=>row?.id===id?structuredClone(row):null,
 stage:async(id,hash,candidate)=>{if(row?.id!==id||row.requestHash!==hash||row.state!=='planning')return false;row={...row,state:'review_ready',candidate};return true},
 claimReview:async id=>{if(row?.id!==id||row.state!=='review_ready'||clock>=row.expiresAt)return null;row={...row,state:'review_running'};return structuredClone(row)},
 complete:async(id,result)=>{assert.equal(row.id,id);assert.equal(row.state,'review_running');row={...row,state:'complete',candidate:null,result}},
 block:async()=>{if(row.state!=='complete')row={...row,state:'blocked'}},
};
(async()=>{
 const plan=async()=>{plans++;return{draft:'unreviewed',facts:['fixture only']}};
 const [a,b]=await Promise.all([prepareContinuation(repo,'a','hash',plan,()=>clock),prepareContinuation(repo,'a','hash',plan,()=>clock)]);
 assert.equal(plans,1);assert.equal(a.status,'pending');assert.equal(b.status,'pending');assert(!JSON.stringify(a).includes('unreviewed'));
 await assert.rejects(prepareContinuation(repo,'a','changed',plan,()=>clock));
 let release;const gate=new Promise(r=>release=r);
 const first=finishContinuation(repo,'a',async()=>{reviews++;await gate;return{message:'verified fixture'}},()=>clock);
 await new Promise(r=>setImmediate(r));const parallel=await finishContinuation(repo,'a',async()=>{reviews++;throw Error('must not run')},()=>clock);assert.equal(parallel.status,'pending');release();await first;
 const replay=await finishContinuation(repo,'a',async()=>{throw Error('must not replay')},()=>clock);assert.equal(replay.status,'complete');assert.equal(reviews,1);
 clock=row.expiresAt;assert.equal((await finishContinuation(repo,'a',async()=>{},()=>clock)).status,'expired');
 row=null;await prepareContinuation(repo,'b','hash',plan,()=>clock);await assert.rejects(finishContinuation(repo,'b',async()=>{reviews++;throw Error('unknown provider outcome')},()=>clock));
 assert.equal((await finishContinuation(repo,'b',async()=>{throw Error('must not retry')},()=>clock)).status,'blocked');assert.equal(reviews,2);
 const db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE organizations(id uuid primary key);CREATE TABLE organization_memberships(id uuid primary key);');
 const org='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
 await db.query('INSERT INTO organizations VALUES($1)',[org]);await db.query('INSERT INTO organization_memberships VALUES($1)',[org]);
 await db.exec(fs.readFileSync('docs/sql/assistant-review-checkpoint.candidate.sql','utf8'));
 await db.query("INSERT INTO assistant_review_checkpoints(id,organization_id,membership_id,principal_hash,idempotency_key,request_hash,state,expires_at) VALUES($1,$2,$2,repeat('a',64),$1,repeat('b',64),'planning',now()+interval '10 minutes')",[id,org]);
 await db.query("UPDATE assistant_review_checkpoints SET state='review_ready',candidate='{}'::jsonb WHERE id=$1",[id]);
 const claim=()=>db.query("UPDATE assistant_review_checkpoints SET state='review_running' WHERE id=$1 AND state='review_ready' RETURNING id",[id]);
 const claims=await Promise.all([claim(),claim()]);assert.equal(claims.reduce((n,r)=>n+r.rows.length,0),1);
 await assert.rejects(db.query("UPDATE assistant_review_checkpoints SET state='review_ready' WHERE id=$1",[id]));
 await assert.rejects(db.query("UPDATE assistant_review_checkpoints SET principal_hash=repeat('c',64),state='blocked' WHERE id=$1",[id]));
 await db.query("UPDATE assistant_review_checkpoints SET state='complete',candidate=null,result='{}'::jsonb WHERE id=$1",[id]);
 await assert.rejects(db.query("UPDATE assistant_review_checkpoints SET state='review_running' WHERE id=$1",[id]));
 assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='assistant_review_checkpoints'::regclass")).rows[0].relrowsecurity,true);
 await db.close();console.log('PASS: idempotent planning; one review under concurrency; result replay without provider; expiry; unknown blocks; SQL CAS/immutability/RLS. LOCAL prototype only.');
})().catch(e=>{console.error(e);process.exitCode=1});
