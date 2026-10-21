// Actual transaction guard, synthetic rows, no database/network/cookies.
const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
let externalReads=0,windowOpen=true,restricted=true;
const actor={sessionId:'s',organizationId:'o',userId:'u',membershipId:'m',role:'OWNER',expiresAt:new Date(Date.now()+60000)};
const good={id:'s',organizationId:'o',userId:'u',membershipId:'m',revokedAt:null,expiresAt:actor.expiresAt,organization:{status:'ACTIVE'},user:{status:'ACTIVE'},membership:{id:'m',organizationId:'o',userId:'u',status:'ACTIVE',role:'OWNER',permissionOverrides:[]}};
function matches(row,where){return Object.entries(where).every(([k,v])=>v&&typeof v==='object'&&!(v instanceof Date)?('gt'in v?row[k]>v.gt:matches(row[k],v)):row[k]===v)}
const deps={'server-only':{},'./release':{PUBLIC_INQUIRY_INTAKE_OPEN:false},'@/lib/assistant/owner-day-config':{ownerMainRestricted:()=>restricted},'@/lib/assistant/chat/limits':{AssistantError:class extends Error{}},'@/lib/assistant/owner-day-access':{
 requireOwnerDaySession:async()=>{externalReads++;throw Error('external pool exhausted')},
 assertOwnerDaySession:a=>{assert(a&&a.role==='OWNER'&&a.expiresAt>new Date())},requireOwnerDayWriteWindow:async()=>{if(!windowOpen)throw Error('closed')}
},'@/lib/permissions/member':{permissionMemberSelect:{role:true},memberHasPermission:(m)=>m.role==='OWNER'}};
const m={exports:{}};vm.runInNewContext('(function(require,module,exports){'+ts.transpileModule(fs.readFileSync('lib/showroom/inquiry-access.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText+'})',{Date})(n=>{assert(n in deps,n);return deps[n]},m,m.exports);
const guard=m.exports.requireInquiryTransactionAccess;
const client=row=>({authSession:{findFirst:async q=>matches(row,q.where)?{membership:row.membership}:null}});
(async()=>{
 await Promise.all([guard(client(good),actor),guard(client(good),actor)]);assert.equal(externalReads,0);
 let checks=1;
 for(const mutate of [r=>r.revokedAt=new Date(),r=>r.expiresAt=new Date(0),r=>r.user.status='DISABLED',r=>r.organization.status='DISABLED',r=>r.membership.status='DISABLED',r=>r.membership.role='SELLER',r=>r.membership.organizationId='other',r=>r.membership.userId='other',r=>r.membershipId='other',r=>r.organizationId='other']){const row=structuredClone(good);mutate(row);await assert.rejects(()=>guard(client(row),actor));checks++}
 await assert.rejects(()=>guard(client(good),null));checks++;windowOpen=false;await assert.rejects(()=>guard(client(good),actor));checks++;
 assert.equal(externalReads,0);console.log('PASS '+checks+' transaction guard cases: occupied global pool, revocation, expiry, membership/tenant, window; no network');
})().catch(e=>{console.error(e);process.exitCode=1});
