// Real guards/routes/services with an in-memory DB/transport; no network or real data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),uuid=()=>crypto.randomUUID(),checks=[];
let clock=Date.parse('2026-10-21T05:00:00Z'),dbClock=clock,session=null,permitted=true,lead=true,reads=0,photoReads=0,modelCalls=0;
class Clock extends Date {constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
const env={NODE_ENV:'test',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_FSsQxUktUBH9VNCGeadBoNnzlD1W',VERCEL_GIT_COMMIT_REF:'review/ai-header-preview-candidate-20261011',MARIPOSA_OWNER_DAY_TEST:'main-2026-10-21',STOREFRONT_ORGANIZATION_ID:'2157bde1-1994-465b-9f80-e1b740ee3cb1',MARIPOSA_ASSISTANT_ORGANIZATION_ID:'2157bde1-1994-465b-9f80-e1b740ee3cb1',MARIPOSA_ASSISTANT_OWNER_MEMBERSHIP_ID:'c580c434-53c7-4f37-a388-da443c4e426e',MARIPOSA_ASSISTANT_ENABLED:'1',MARIPOSA_ASSISTANT_PRICE_ACK:'gpt-6-luna:2026-10-20:standard:0.10:0.01:0.125:0.50',OPENAI_API_KEY:'synthetic-not-a-key'};
const actor={organizationId:env.STOREFRONT_ORGANIZATION_ID,membershipId:env.MARIPOSA_ASSISTANT_OWNER_MEMBERSHIP_ID,userId:uuid(),sessionId:uuid(),role:'OWNER',expiresAt:new Date(clock+86400000),hasOrganizationWideBranchAccess:true,allowedBranchIds:[]};
const branch={id:uuid(),name:'Synthetic MAIN branch',city:'Synthetic',timezone:'Asia/Almaty'};
let attempts=[],hist=null,messages=[],inquiries=[],audits=0,afterInsert=null,lock=Promise.resolve();
const db={
 branch:{findMany:async()=>{reads++;return[branch]},findFirst:async q=>{reads++;return q.where.id===branch.id?branch:null}},
 category:{findMany:async()=>{reads++;return[]}},
 productVariant:{groupBy:async()=>{reads++;return[]},findMany:async()=>{reads++;return[]},findFirst:async()=>{reads++;return null}},
 organizationMembership:{findFirst:async()=>permitted?{id:actor.membershipId}:null},
 inquiry:{count:async()=>inquiries.length,create:async({data})=>{const row={id:uuid(),...data};inquiries.push(row);return{id:row.id}}},
 $transaction:async fn=>{const previous=lock;let release;lock=new Promise(r=>release=r);await previous;const before=structuredClone({attempts,hist,messages,inquiries,audits});try{return await fn(db)}catch(e){({attempts,hist,messages,inquiries,audits}=before);throw e}finally{release()}},
 $queryRaw:async(strings,...v)=>{const q=strings.join('?');
   if(q.includes('clock_timestamp'))return[{open:dbClock>=Date.parse('2026-10-20T19:00:00Z')&&dbClock<Date.parse('2026-10-21T19:00:00Z')}];
   if(q.includes('FROM assistant_provider_attempts')){const active=attempts.filter(a=>a.organizationId===actor.organizationId);return[{minute:BigInt(active.filter(a=>a.created>dbClock-60000).length),hour:BigInt(active.filter(a=>a.created>dbClock-3600000).length),test:BigInt(active.length),smoke:BigInt(active.filter(a=>a.cap===64).length),active:BigInt(active.filter(a=>a.lease>dbClock).length),in_window:dbClock>=Number(v[0])&&dbClock<Number(v[3])}]}
   if(q.includes('FROM assistant_conversations'))return hist&&v.includes(hist.organizationId)&&v.includes(hist.ownerHash)&&v.includes(hist.principal)?[structuredClone(hist)]:[];
   if(q.includes('FROM assistant_messages'))return structuredClone(messages);
   if(q.includes('assistant_history_quotas'))return[{count:1}];
   throw Error('Unmocked query '+q);
 },
 $executeRaw:async(strings,...v)=>{const q=strings.join('?');
   if(q.includes('pg_advisory'))return 1;
   if(q.includes('INSERT INTO assistant_provider_attempts')){attempts.push({id:v[0],organizationId:v[1],created:dbClock,lease:Number(v[3]),cap:v[5]});return 1}
   if(q.includes('UPDATE assistant_provider_attempts')){attempts.find(a=>a.id===v[0]).lease=dbClock;return 1}
   if(q.includes('INSERT INTO assistant_conversations')){hist={id:v[0],organizationId:v[1],ownerHash:v[3],principal:v[4],snapshot:JSON.parse(v[6]),creation_key:v[7],creation_hash:v[8],version:1,expires_at:new Date(clock+7*86400000),inquiry_id:null};return 1}
   if(q.includes('INSERT INTO assistant_messages')){messages.push({role:v[2],content:v[3]});return 1}
   if(q.includes('UPDATE assistant_conversations SET inquiry_id')){hist.inquiry_id=v[0];hist.handoff_key=v[1];hist.handoff_hash=v[2];hist.version++;afterInsert?.();return 1}
   if(q.includes('UPDATE assistant_conversations SET snapshot')){hist.snapshot=JSON.parse(v[0]);hist.version++;return 1}
   throw Error('Unmocked mutation '+q);
 },
};
function loader(){const cache=new Map();function load(file){file=file.replaceAll('\\','/');if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);
 let source=fs.readFileSync(path.join(root,file),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const req=n=>{
  if(n==='server-only')return{};
  if(n==='@/lib/db')return{db};
  if(n==='@/generated/prisma/client')return{Prisma:{}};
  if(n==='@/lib/auth/session')return{getCurrentSession:async()=>session};
  if(n==='@/lib/permissions/effective')return{hasPermission:async(_,p)=>permitted&&(!p.startsWith('LEAD_')||lead)};
  if(n==='@/lib/audit/log')return{appendAuditLog:async()=>audits++};
  if(n==='@/lib/inquiries/service')return{getInquiry:async()=>({})};
  if(n==='@/lib/availability/capacity')return{getVariantAvailability:async()=>{throw Error('Unexpected availability read')}};
  if(n==='./photos'&&file==='lib/showroom/service.ts')return{readPublicPhoto:async(org)=>{assert.equal(org,actor.organizationId);photoReads++;return new Blob(['synthetic'],{type:'image/webp'})}};
  if(n==='openai')return class {constructor(){this.responses={create:async body=>{modelCalls++;return{status:'completed',model:'gpt-6-luna',service_tier:'default',output:[],output_text:'{\"ok\":true}',usage:{input_tokens:100,output_tokens:5,total_tokens:105,input_tokens_details:{cached_tokens:0,cache_write_tokens:0},output_tokens_details:{reasoning_tokens:0}}}}}}};
  if(file==='app/showroom/page.tsx'&&n.startsWith('./'))return new Proxy({},{get:(_,key)=>key==='__esModule'?true:key});
  let local=n.startsWith('@/')?n.slice(2):n.startsWith('.')?path.posix.join(path.posix.dirname(file),n):null;
  if(local){if(fs.existsSync(path.join(root,local))&&path.extname(local))return require(path.join(root,local));return load(local+(fs.existsSync(path.join(root,local+'.ts'))?'.ts':'.tsx'))}
  return require(n);
 };
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{console,Date:Clock,Buffer,Intl,URL,URLSearchParams,Request,Response,Headers,Blob,AbortSignal,AbortController,TextEncoder,Uint8Array,setTimeout,clearTimeout,process:{env,versions:process.versions},structuredClone})(req,m,m.exports);return m.exports}return load}
const load=loader(),config=load('lib/assistant/owner-day-config.ts'),P=config.OWNER_DAY;
const principal=crypto.createHash('sha256').update(JSON.stringify([actor.organizationId,actor.userId,actor.sessionId])).digest('hex');
const owner={organizationId:actor.organizationId,ownerHash:'d'.repeat(64),principal};
const access=load('lib/assistant/owner-day-access.ts'),policy=load('lib/assistant/chat/owner-test.ts'),service=load('lib/showroom/service.ts'),history=load('lib/assistant/history/service.ts');
const request=(route,method='GET',body)=>new Request('http://localhost/api/showroom/'+route,{method,headers:{origin:'http://localhost',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name)}
(async()=>{
 await check('Full Almaty day, immutable boundaries, incorrect/expired configuration fails closed',async()=>{
  assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:P.timezone,dateStyle:'short',timeStyle:'short',hourCycle:'h23'}).format(new Date(P.start)),'2026-10-21, 00:00');
  assert(config.ownerDayConfig(env,P.start));assert(config.ownerDayConfig(env,P.until-1));assert.equal(config.ownerDayConfig(env,P.start-1),null);assert.equal(config.ownerDayConfig(env,P.until),null);
  for(const [key,value]of [['MARIPOSA_OWNER_DAY_TEST','0'],['VERCEL_ENV','production'],['VERCEL_PROJECT_ID','other'],['VERCEL_GIT_COMMIT_REF','main'],['STOREFRONT_ORGANIZATION_ID',uuid()],['MARIPOSA_ASSISTANT_OWNER_MEMBERSHIP_ID',uuid()],['MARIPOSA_PILOT_HISTORY_TEST','0'],['MARIPOSA_ISOLATED_PREVIEW','0']])assert.equal(config.ownerDayConfig({...env,[key]:value}),null,key);
  assert(config.ownerMainRestricted({STOREFRONT_ORGANIZATION_ID:P.organizationId}),'Removing the flag must not expose MAIN');
 });
 await check('SSR, direct catalog/selection/photo, history and AI deny guest/foreign/expired/wrong-role/no-rights before MAIN data',async()=>{
  const catalog=load('app/api/showroom/catalog/route.ts'),selection=load('app/api/showroom/selection/route.ts'),photo=load('app/api/showroom/photo/route.ts'),hr=load('app/api/showroom/history/route.ts'),ai=load('app/api/showroom/assistant/route.ts'),page=load('app/showroom/page.tsx');
  for(const bad of [null,{...actor,organizationId:uuid()},{...actor,membershipId:uuid()},{...actor,role:'SELLER'},{...actor,expiresAt:new Date(clock-1)},actor]){
   session=bad;permitted=bad!==actor;const before=[reads,photoReads,modelCalls];
   await assert.rejects(service.publicBranches());await assert.rejects(service.publicBrowse({}));await assert.rejects(service.publicProduct({productId:uuid()}));await assert.rejects(service.publicHomePhotoCards({}));await assert.rejects(service.publicPhoto({}));
   const c=await catalog.GET(request('catalog?branchId='+branch.id+'&from=2026-10-22T10:00&until=2026-10-23T10:00'));assert(c.status>=400);
   const s=await selection.GET(request('selection?branchId='+branch.id+'&variantId='+uuid()+'&from=2026-10-22T10:00&until=2026-10-23T10:00'));assert(s.status>=400);
   assert((await photo.GET(request('photo?productId='+uuid()+'&imageId='+uuid()))).status>=400);
   assert((await hr.GET(request('history'))).status>=400);
   assert((await ai.POST(request('assistant','POST',{}))).status>=400);
   const rendered=await page.default({searchParams:Promise.resolve({productId:uuid()})});assert.equal(rendered.type,'main');
   assert.deepEqual([reads,photoReads,modelCalls],before);
  }session=actor;permitted=true;
 });
 await check('Exact owner sees real service DTO path without provider readiness; private photos reauthorize before 304',async()=>{
  env.MARIPOSA_ASSISTANT_ENABLED='0';delete env.OPENAI_API_KEY;
  assert.equal((await service.publicBranches())[0].id,branch.id);assert.equal((await service.publicBrowse({})).items.length,0);
  const photo=load('app/api/showroom/photo/route.ts'),r=await photo.GET(request('photo?productId='+uuid()+'&imageId='+uuid()));
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');
  session=null;const before=photoReads;assert((await photo.GET(request('photo?productId='+uuid()+'&imageId='+uuid()))).status>=400);assert.equal(photoReads,before);session=actor;
  env.MARIPOSA_ASSISTANT_ENABLED='1';env.OPENAI_API_KEY='synthetic-not-a-key';
 });
 await check('Consent and handoff use real writer contract, exact principal, rights, idempotency and transaction expiry rollback',async()=>{
  const snapshot={branchId:branch.id,from:'',until:'',draft:'',messages:[{role:'user',content:'Нужен белый наряд'},{role:'assistant',content:'Уточним пожелания.'}]};
  const consent={action:'consent',consent:true,policy:'web-history-7d-v1',key:uuid(),snapshot};
  await assert.rejects(history.writeHistory({...owner,principal:'guest'},consent));await assert.rejects(history.writeHistory({...owner,organizationId:uuid()},consent));
  await assert.rejects(history.writeHistory(owner,{...consent,snapshot:{...snapshot,branchId:uuid()}}));assert.equal(hist,null);
  let saved=await history.writeHistory(owner,consent);assert.equal(saved.version,1);assert.equal(messages.length,2);
  const transfer={action:'handoff',version:1,key:uuid(),confirmed:true,contact:'owner@example.invalid'};
  lead=false;await assert.rejects(history.writeHistory(owner,transfer));assert.equal(inquiries.length,0);lead=true;
  afterInsert=()=>{dbClock=P.until};await assert.rejects(history.writeHistory(owner,transfer));assert.equal(inquiries.length,0);assert.equal(hist.inquiry_id,null);dbClock=clock;afterInsert=null;
  saved=await history.writeHistory(owner,transfer);assert.equal(saved.handedOff,true);assert.equal(inquiries.length,1);assert.equal(audits,1);
  assert.equal((await history.writeHistory(owner,transfer)).handedOff,true);assert.equal(inquiries.length,1);
  await assert.rejects(history.writeHistory(owner,{...transfer,key:uuid()}));await assert.rejects(history.revokeHistory(owner));await assert.rejects(history.retentionBatch(true));
 });
 await check('One activation smoke included in shared allowance; retry denied; restart retains attempts and lease',async()=>{
  attempts=[];const smoke=load('app/api/showroom/assistant/smoke/route.ts'),r=await smoke.POST(request('assistant/smoke','POST'));assert.equal(r.status,200);assert.equal(modelCalls,1);assert.equal(attempts.length,1);
  assert.equal((await smoke.POST(request('assistant/smoke','POST'))).status,429);assert.equal(modelCalls,1);
  const scope={organizationId:actor.organizationId,membershipId:actor.membershipId},budget=load('lib/assistant/chat/provider-budget.ts');
  const race=await Promise.allSettled([budget.reserveProviderCall(scope,1000,1400),loader()('lib/assistant/chat/provider-budget.ts').reserveProviderCall(scope,1000,1400)]);
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(attempts.length,2);
  await assert.rejects(loader()('lib/assistant/chat/provider-budget.ts').reserveProviderCall(scope,1000,1400));await race.find(x=>x.status==='fulfilled').value();
  attempts=Array.from({length:99},(_,i)=>({id:uuid(),organizationId:actor.organizationId,created:clock-120000,lease:clock-120000,cap:i===0?64:1400}));
  await(await budget.reserveProviderCall(scope,1000,1400))();assert.equal(attempts.length,100);await assert.rejects(budget.reserveProviderCall(scope,1000,1400));assert.equal(attempts.length,100);
  assert.equal(policy.ownerTestPolicy().reservationNano*100,1847560000);assert.equal(policy.ownerTestPolicy().budgetNano,2000000000);
 });
 await check('Actual model request contains bounded chat/context, no session/customer/contact fields; recognizable contact input blocked',async()=>{
  const consultation=load('lib/assistant/chat/consultation.ts'),contracts=load('lib/assistant/chat/contracts.ts');
  const context=load('lib/assistant/chat/outfit-contracts.ts').emptyOutfit();context.heightCm=128;context.criteria.dress.size='134';context.criteria.dress.color='Белый';
  const input={syntheticOnly:true,branchId:branch.id,context,messages:[{role:'user',content:'Нужен наряд к празднику'}]};
  const tools={branches:[branch],categories:[],cards:new Map(),searched:false};let captured=null;
  const provider={create:async body=>{captured=body;throw Error('CAPTURE_ONLY')}};
  await assert.rejects(consultation.runAssistantConversation(input,provider,tools,new AbortController().signal),/CAPTURE_ONLY/);
  const wire=JSON.stringify(captured);assert(wire.includes('Нужен наряд'));assert(wire.includes('128'));assert(wire.includes('134'));assert.equal(captured.store,false);
  for(const excluded of [actor.userId,actor.sessionId,actor.membershipId,'owner@example.invalid','OPENAI_API_KEY'])assert(!wire.includes(excluded));
  for(const text of ['Мой телефон +77011234567','Меня зовут Анна','owner@example.invalid']){
   captured=null;await assert.rejects(consultation.runAssistantConversation({...input,messages:[{role:'user',content:text}]},provider,tools,new AbortController().signal));assert.equal(captured,null);
  }
  assert.equal(contracts.chatInput.safeParse({...input,replyContact:'owner@example.invalid'}).success,false);
  assert.equal(contracts.hasSensitiveText('Анна'),false,'Free text names cannot be guaranteed excluded; disclose this limitation');
 });
 await check('Closure denies catalogue/history/provider and cannot be reset with old start/until environment',async()=>{
  clock=P.until;dbClock=clock;env.MARIPOSA_ASSISTANT_TEST_START=new Date(clock).toISOString();env.MARIPOSA_ASSISTANT_TEST_UNTIL=new Date(clock+86400000).toISOString();
  assert.equal(policy.ownerTestConfig(),null);await assert.rejects(service.publicBranches());await assert.rejects(history.readHistory(owner));await assert.rejects(access.requireOwnerDaySession());
 });
 const report={status:'PASS',syntheticOnly:true,liveModelCalls:0,scriptedTransportCalls:modelCalls,checks};fs.mkdirSync(path.join(root,'docs/evidence/owner-main-day-20261021'),{recursive:true});fs.writeFileSync(path.join(root,'docs/evidence/owner-main-day-20261021/targeted.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1});
