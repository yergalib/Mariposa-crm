const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module'),ts=require('typescript'),cp=require('child_process');
const original=Module._load,resolve=Module._resolveFilename;Module._resolveFilename=function(k,...a){return resolve.call(this,k.startsWith('@/')?path.resolve(k.slice(2)):k,...a)};Module._load=function(k,...a){if(k==='server-only')return{};if(k==='@/lib/db'||k==='openai')throw Error('LIVE_FORBIDDEN');return original.call(this,k,...a)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,f);
global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};Date.now=()=>Date.parse('2026-10-22T12:00Z');
const {OWNER_DAY:o}=require('../lib/assistant/owner-day-config.ts');
Object.assign(process.env,{MARIPOSA_OWNER_DAY_TEST:o.flag,VERCEL_ENV:'preview',VERCEL_PROJECT_ID:o.project,VERCEL_GIT_COMMIT_REF:o.ref,STOREFRONT_ORGANIZATION_ID:o.organizationId,MARIPOSA_ASSISTANT_ORGANIZATION_ID:o.organizationId,MARIPOSA_ASSISTANT_OWNER_MEMBERSHIP_ID:o.membershipId,MARIPOSA_TELEGRAM_MODE:'owner-test-v1',MARIPOSA_TELEGRAM_BOT_ID:'8768793138',MARIPOSA_TELEGRAM_BOT_TOKEN:'8768793138:'+ 'synthetic'.repeat(4),MARIPOSA_TELEGRAM_WEBHOOK_SECRET:'fixture'.repeat(8),MARIPOSA_TELEGRAM_INGRESS_HOST:'mariposa-telegram-owner-test-mariposa-crm.vercel.app'});
for(const k of ['MARIPOSA_PILOT_HISTORY_TEST','MARIPOSA_PILOT_TEST_RUN_ID','MARIPOSA_ISOLATED_PREVIEW'])delete process.env[k];

let authorized=true;
const prior=Module._load;Module._load=function(k,...a){if(k==='@/lib/assistant/owner-day-access'||k==='../owner-day-access')return {requireOwnerDaySession:async()=>{if(!authorized)throw Error('denied')}};return prior.call(this,k,...a)};
const {connectTelegram}=require('../lib/assistant/telegram/connect.ts');

const target='https://mariposa-telegram-owner-test-mariposa-crm.vercel.app/api/telegram/webhook';
const request=()=>new Request('https://owner.invalid/api/telegram/connect',{method:'POST',headers:{origin:'https://owner.invalid','sec-fetch-site':'same-origin'}});

(async()=>{
let calls=[],url='https://mariposaastana-bot.onrender.com/private-path',pending=0,probe=200,unknown=false,allowed=["message"],expected=["message"];
const transport=async(u,opts)=>{calls.push(u===target?'probe':u.split('/').at(-1));assert.equal(opts.redirect,'error');const method=calls.at(-1);if(method==='probe')return new Response(null,{status:probe});let result;if(method==='getMe')result={id:8768793138,username:'Mariposaastana_bot',is_bot:true};if(method==='getWebhookInfo')result={url,pending_update_count:pending,allowed_updates:allowed,max_connections:1};if(method==='setWebhook'){const b=JSON.parse(opts.body);assert.equal(b.url,target);assert.equal(b.drop_pending_updates,false);assert.deepEqual(b.allowed_updates,expected);allowed=b.allowed_updates;assert.equal(b.max_connections,1);url=target;if(unknown)throw Error('uncertain secret');result=true;}return new Response(JSON.stringify({ok:true,result}));};
authorized=false;assert.equal((await connectTelegram(request(),transport)).status,403);assert.equal(calls.length,0);authorized=true;
pending=1;assert.equal((await connectTelegram(request(),transport)).status,409);assert(!calls.includes('setWebhook'));pending=0;calls=[];
probe=503;assert.equal((await connectTelegram(request(),transport)).status,409);assert(!calls.includes('setWebhook'));probe=200;calls=[];
unknown=true;const r=await connectTelegram(request(),transport);assert.equal(r.status,200);const text=await r.text();assert(!text.includes('private-path'));assert(!text.includes(process.env.MARIPOSA_TELEGRAM_WEBHOOK_SECRET));assert.equal(calls.filter(x=>x==='setWebhook').length,1);
calls=[];assert.equal((await connectTelegram(request(),transport)).status,200);assert(!calls.includes('setWebhook'));
Object.assign(process.env,{MARIPOSA_TELEGRAM_MODE:'customer-test-v1',MARIPOSA_TELEGRAM_REQUESTS:'confirmed-v1',MARIPOSA_TELEGRAM_CUSTOMER_BRANCH_ID:'1ae79fec-2d81-4085-982a-f7f7c64a53be',MARIPOSA_TELEGRAM_CUSTOMER_MINUTE_TURNS:'3',MARIPOSA_TELEGRAM_CUSTOMER_DAY_TURNS:'30'});
expected=['message','callback_query'];pending=2;calls=[];
assert.equal((await connectTelegram(request(),transport)).status,200);assert.equal(calls.filter(x=>x==='setWebhook').length,1);assert.deepEqual(allowed,expected);
calls=[];assert.equal((await connectTelegram(request(),transport)).status,200);assert(!calls.includes('setWebhook'));
allowed=['message'];const unchanged=async(u,opts)=>u.endsWith('/setWebhook')?new Response(JSON.stringify({ok:true,result:true})):transport(u,opts);
assert.equal((await connectTelegram(request(),unchanged)).status,409);
console.log('PASS OFFLINE connect: OWNER+CSRF, exact bot/current host, pending queue stop, callback probe, one setWebhook, no-drop, uncertain outcome readback, existing-target idempotency, redaction; no network.');
})().catch(e=>{console.error(e);process.exitCode=1});
