// Targeted tenant gate regression. Synthetic identities only, no env/DB/network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),now=Date.now();
const tenant='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',owner='00000000-0000-4000-8000-000000000003';
const env={MARIPOSA_ASSISTANT_ENABLED:'1',VERCEL_ENV:'preview',MARIPOSA_ASSISTANT_ORGANIZATION_ID:tenant,STOREFRONT_ORGANIZATION_ID:tenant,MARIPOSA_ASSISTANT_OWNER_MEMBERSHIP_ID:owner,MARIPOSA_ASSISTANT_PREVIEW_REF:'review/synthetic-owner',VERCEL_GIT_COMMIT_REF:'review/synthetic-owner',MARIPOSA_ASSISTANT_TEST_START:new Date(now-1000).toISOString(),MARIPOSA_ASSISTANT_TEST_UNTIL:new Date(now+3599000).toISOString(),MARIPOSA_ASSISTANT_PRICE_ACK:'gpt-6-luna:2026-10-11:0.125:0.5',OPENAI_API_KEY:'SYNTHETIC_NEVER_SENT'};
class AssistantError extends Error{constructor(message,status){super(message);this.status=status}}
let history=false,intake=false,dbTouches=0;
function load(file){
  const m={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,process:{env,versions:process.versions}})(name=>{
    if(name==='server-only')return{};
    if(name==='zod')return require('zod');
    if(name==='node:crypto')return require('node:crypto');
    if(name==='../history/contracts')return{get HISTORY_OPEN(){return history}};
    if(name==='@/lib/showroom/release')return{get PUBLIC_INQUIRY_INTAKE_OPEN(){return intake}};
    if(name==='./owner-test')return load('lib/assistant/chat/owner-test.ts');
    if(name==='./limits')return{AssistantError};
    if(name==='@/lib/db')return{db:{$transaction:async()=>{dbTouches++;throw Error('Unexpected database access')}}};
    throw Error(`Unexpected dependency ${name}`);
  },m,m.exports);return m.exports;
}
(async()=>{
  const {ownerTestConfig}=load('lib/assistant/chat/owner-test.ts'),{assertAssistantStaff}=load('lib/assistant/chat/access.ts'),{reserveProviderCall}=load('lib/assistant/chat/provider-budget.ts');
  const session={role:'OWNER',organizationId:tenant,membershipId:owner,expiresAt:new Date(now+3600000)};
  assert.equal(ownerTestConfig(env,now).organizationId,tenant);assertAssistantStaff(session);
  let denied=0;
  for(const patch of [{MARIPOSA_ASSISTANT_ORGANIZATION_ID:undefined},{MARIPOSA_ASSISTANT_ORGANIZATION_ID:''},{MARIPOSA_ASSISTANT_ORGANIZATION_ID:'invalid'},{MARIPOSA_ASSISTANT_ORGANIZATION_ID:other},{STOREFRONT_ORGANIZATION_ID:other},{STOREFRONT_ORGANIZATION_ID:undefined},{VERCEL_ENV:'production'},{VERCEL_ENV:undefined},{VERCEL_GIT_COMMIT_REF:'review/other'},{VERCEL_GIT_COMMIT_REF:undefined},{MARIPOSA_ASSISTANT_ENABLED:'0'}]){
    assert.equal(ownerTestConfig({...env,...patch},now),null);denied++;
  }
  for(const bad of [null,{...session,organizationId:other},{...session,membershipId:other},{...session,role:'MANAGER'}]){assert.throws(()=>assertAssistantStaff(bad));denied++;}
  for(const scope of [{organizationId:other,membershipId:owner},{organizationId:tenant,membershipId:other}]){await assert.rejects(()=>reserveProviderCall(scope,100,100),e=>e.status===403);denied++;}
  assert.equal(dbTouches,0);
  history=true;assert.equal(ownerTestConfig(env,now),null);history=false;
  intake=true;assert.equal(ownerTestConfig(env,now),null);intake=false;
  // Matching tenant selection is explicit, not a hard-coded Pilot allowance.
  assert.equal(ownerTestConfig({...env,MARIPOSA_ASSISTANT_ORGANIZATION_ID:other,STOREFRONT_ORGANIZATION_ID:other},now).organizationId,other);
  console.log(JSON.stringify({status:'PASS',denied,historyIntakeClosed:true,explicitMatchingTenant:true,crossTenantDbTouches:dbTouches,modelCalls:0,networkCalls:0}));
})().catch(e=>{console.error(e);process.exitCode=1});
