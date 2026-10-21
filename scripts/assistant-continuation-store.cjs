const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),crypto=require('crypto'),{PGlite}=require('@electric-sql/pglite');
const pg=new PGlite(),org=crypto.randomUUID(),member=crypto.randomUUID();
let actor={organizationId:org,membershipId:member,userId:crypto.randomUUID(),sessionId:crypto.randomUUID()},allowed=true;
const wrap=tx=>({$queryRaw:async(s,...v)=>(await tx.query(s.reduce((a,x,i)=>a+(i?'$'+i:'')+x,''),v)).rows,$executeRaw:async(s,...v)=>(await tx.query(s.reduce((a,x,i)=>a+(i?'$'+i:'')+x,''),v)).affectedRows,$transaction:fn=>pg.transaction(t=>fn(wrap(t)))});
const db=wrap(pg);class AssistantError extends Error{}
const loaded={exports:{}};const req=n=>{
 if(n==='server-only')return{};if(n==='node:crypto')return crypto;if(n==='@/lib/db')return{db};if(n==='./limits')return{AssistantError};
 if(n==='./recorded-turn')return{checkpointRecord:v=>v};
 if(n==='../owner-day-access')return{requireOwnerDaySession:async()=>{if(!allowed)throw Error('owner denied');return {...actor}},requireOwnerDayWriteWindow:async()=>{if(!allowed)throw Error('window denied')}};
 throw Error('Unexpected import '+n);
};
vm.runInNewContext('(function(require,module,exports){'+ts.transpileModule(fs.readFileSync('lib/assistant/chat/continuation-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'})',{Date,Buffer})(req,loaded,loaded.exports);
(async()=>{
 await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE organizations(id uuid primary key);CREATE TABLE organization_memberships(id uuid primary key);');
 await pg.query('INSERT INTO organizations VALUES($1)',[org]);await pg.query('INSERT INTO organization_memberships VALUES($1)',[member]);await pg.exec(fs.readFileSync('docs/sql/assistant-review-checkpoint.candidate.sql','utf8'));
 const repo=await loaded.exports.continuationRepository(),key=crypto.randomUUID(),hash='a'.repeat(64);
 const [one,two]=await Promise.all([repo.begin(key,hash),repo.begin(key,hash)]);assert.equal(Number(one.created)+Number(two.created),1);assert.equal(one.row.id,two.row.id);
 await assert.rejects(repo.begin(key,'b'.repeat(64)));const id=one.row.id;
 await repo.stage(id,hash,{kind:'review',fixture:true});const claims=await Promise.all([repo.claimReview(id),repo.claimReview(id)]);assert.equal(claims.filter(Boolean).length,1);
 await repo.complete(id,{kind:'complete',fixture:true});await repo.block(id);assert.equal((await repo.read(id)).state,'complete');assert((await repo.read(id)).candidate,'completion must not erase stored draft without approval');
 const old={...actor};actor.sessionId=crypto.randomUUID();await assert.rejects(repo.read(id));const other=await loaded.exports.continuationRepository();assert.equal(await other.read(id),null);assert.equal(await other.findKey(key),null);
 actor=old;allowed=false;await assert.rejects(repo.read(id));allowed=true;
 const expired=await repo.begin(crypto.randomUUID(),hash);await repo.block(expired.row.id);assert.equal(await repo.claimReview(expired.row.id),null);
 console.log('PASS actual adapter SQL: idempotent begin/conflict, single claim, retained draft, complete not overwritten, session isolation, revoked owner gate, blocked no retry; in-memory only');await pg.close();
})().catch(async e=>{console.error(e);await pg.close();process.exitCode=1});
