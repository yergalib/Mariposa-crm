const assert=require('node:assert/strict'),Module=require('node:module');
require('./assistant-small-smoke-fixture.cjs');global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const org=process.env.STOREFRONT_ORGANIZATION_ID,branchA='00000000-0000-4000-8000-000000000002',branchB='00000000-0000-4000-8000-000000000003';
let revoked=false,webCalls=0,checks=0,webEnabled=true;const seen=[];
const owner={organizationId:org,membershipId:'owner',sessionId:'session'};let enrollment,bindings=0;
const db={branch:{findMany:async a=>{seen.push(a.where);return []},findFirst:async()=>({id:branchA})},
 $transaction:async f=>f(db),$queryRaw:async(strings,...v)=>{const q=strings.join('?');if(q.includes('assistant_telegram_enrollments'))return enrollment&&v[0]===enrollment.id&&v[3]===owner.sessionId?[enrollment]:[];throw Error('SQL not mocked')},
 $executeRaw:async(strings,...v)=>{const q=strings.join('?');
  if(q.includes('INSERT INTO assistant_telegram_enrollments')){enrollment={id:v[0],branch_id:v[4],bot:v[5],hash:v[6],sender_id:null,chat_id:null,confirmed_at:null};return 1}
  if(q.includes('SET sender_id')){if(enrollment&&enrollment.hash===v[2]&&enrollment.bot===v[3]&&!enrollment.sender_id){enrollment.sender_id=v[0];enrollment.chat_id=v[1];return 1}return 0}
  if(q.includes('INSERT INTO assistant_telegram_bindings')){bindings++;return 1}
  if(q.includes('SET confirmed_at')){enrollment.confirmed_at=new Date();return 1}
  throw Error('Mutation not mocked');
 }};
const load=Module._load;
Module._load=function(k,...a){
 if(k==='@/lib/db')return {db};
 if(k==='@/lib/inquiries/record')return {createInquiryRecord:async()=>{throw Error('UNEXPECTED_INQUIRY')}};
 if(k==='./owner')return {authorizeTelegramOwner:async()=>{checks++;if(revoked)throw Error('REVOKED')}};
 if(k==='@/lib/assistant/owner-day-config'||k==='../owner-day-config')return {ownerMainRestricted:()=>true,ownerDayConfig:()=>({organizationId:org,membershipId:'owner',until:Date.now()+60000})};
 if(k==='@/lib/assistant/owner-day-access'||k==='../owner-day-access')return {requireOwnerDaySession:async()=>{webCalls++;if(!webEnabled)throw Error('NO_WEB');return owner}};
 if(k==='@/lib/showroom/inquiry-access')return {requireInquiryTransactionAccess:async()=>{if(!webEnabled)throw Error('REVOKED_WEB')}};
 if(k==='@/generated/prisma/client')return {Prisma:{}};
 if(k==='@/lib/tenant/context')return {createTenantContext:id=>({organizationId:id})};
 if(k==='./photos'||k.includes('/availability/'))return {};
 return load.call(this,k,...a);
};
const {withTelegramCatalog,telegramCatalogBranch}=require('../lib/assistant/telegram/catalog-context.ts');
const service=require('../lib/showroom/service.ts');
const enroll=require('../lib/assistant/telegram/enrollment.ts');
(async()=>{
 process.env.VERCEL_ENV='preview';
 await service.publicBranches();assert.equal(webCalls,1);assert.equal(seen[0].AND,undefined);
 await Promise.all([withTelegramCatalog({organizationId:org,branchId:branchA},async()=>{await Promise.resolve();await service.publicBranches();assert.equal(telegramCatalogBranch(),branchA)}),withTelegramCatalog({organizationId:org,branchId:branchB},async()=>{await service.publicBranches();assert.equal(telegramCatalogBranch(),branchB)})]);
 assert.equal(webCalls,1);assert.deepEqual(seen.slice(1).map(w=>w.AND[0].id).sort(),[branchA,branchB].sort());assert.equal(telegramCatalogBranch(),undefined);
 await withTelegramCatalog({organizationId:org,branchId:branchA},async()=>{revoked=true;await assert.rejects(service.publicBranches());});assert.equal(webCalls,1);revoked=false;
 await assert.rejects(withTelegramCatalog({organizationId:'other',branchId:branchA},()=>service.publicBranches()));assert(checks>=5);
 const started=await enroll.startTelegramEnrollment(123456,branchA);assert.equal(bindings,0);
 let status=await enroll.inspectTelegramEnrollment(started.enrollmentId,123456);assert.equal(status.status,'awaiting_bot_command');
 const event={update_id:1,message:{message_id:1,date:1,from:{id:12,is_bot:false},chat:{id:12,type:'private'},text:started.command}};
 await enroll.redeemTelegramEnrollment(event,123456);assert.equal(bindings,0);
 status=await enroll.inspectTelegramEnrollment(started.enrollmentId,123456);assert.equal(status.senderId,'12');
 await enroll.inspectTelegramEnrollment(started.enrollmentId,123456,true);await enroll.inspectTelegramEnrollment(started.enrollmentId,123456,true);assert.equal(bindings,1);
 webEnabled=false;await assert.rejects(enroll.inspectTelegramEnrollment(started.enrollmentId,123456,true));assert.equal(bindings,1);
 console.log('PASS OFFLINE actual catalog service: WEB unchanged, Telegram branch AND isolation, concurrent context isolation, revocation/no fallback/wrong tenant; enrollment command alone never activates, owner confirmation one binding, revoked WEB denied. DB simulated.');
})().catch(e=>{console.error(e);process.exitCode=1});
