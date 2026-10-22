const assert=require('node:assert/strict'),Module=require('node:module');
require('./assistant-small-smoke-fixture.cjs');
global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
process.env.MARIPOSA_TELEGRAM_MODE='owner-test-v1';
const {telegramNetwork}=require('../lib/assistant/telegram/network.ts');
let member=true,bound=true,branch=true,config=true;const now=Date.now();
const scope={enabled:true,consent:true,organizationId:'org',membershipId:'owner',branchId:'branch',userId:1,chatId:1,botId:123456,generation:'fixture',start:now-1000,until:now+60000};
const load=Module._load;
Module._load=function(k,...a){
 if(k==='@/lib/db')return {db:{$queryRaw:async()=>bound?[{id:'binding'}]:[],organizationMembership:{findFirst:async args=>{assert.equal(args.where.role,'OWNER');assert.equal(args.where.user.status,'ACTIVE');assert.equal(args.where.organization.status,'ACTIVE');return member?{role:'OWNER',permissionOverrides:[]}:null}},branch:{findFirst:async args=>{assert.equal(args.where.isPublic,true);return branch?{id:'branch'}:null}}}};
 if(k==='../owner-day-config')return {ownerDayConfig:()=>config?{organizationId:'org',membershipId:'owner',start:now-1000,until:now+60000}:null};
 return load.call(this,k,...a);
};
const {authorizeTelegramOwner}=require('../lib/assistant/telegram/owner.ts');
(async()=>{
 await authorizeTelegramOwner(scope);await authorizeTelegramOwner(scope,true);
 member=false;await assert.rejects(authorizeTelegramOwner(scope));member=true;
 bound=false;await assert.rejects(authorizeTelegramOwner(scope));bound=true;
 branch=false;await assert.rejects(authorizeTelegramOwner(scope));branch=true;
 config=false;await assert.rejects(authorizeTelegramOwner(scope));config=true;
 await assert.rejects(authorizeTelegramOwner({...scope,membershipId:'other'}));
 await assert.rejects(authorizeTelegramOwner({...scope,until:now+70000}));
 const token='123456:'+ 'fixture'.repeat(5);let calls=0,method='';
 const client=telegramNetwork(token,async(url,options)=>{
  calls++;method=url.split('/').at(-1);assert.equal(options.redirect,'error');assert.equal(options.method,'POST');
  const body=JSON.parse(options.body);if(method==='sendMessage'){assert.equal(body.chat_id,1);assert.equal(body.parse_mode,undefined);assert.equal(body.protect_content,true);}
  return {ok:true,json:async()=>({ok:true,result:method==='getMe'?{id:2,is_bot:true,username:'fixture_bot'}:method==='getWebhookInfo'?{url:'https://private.invalid/secret',pending_update_count:3}:{message_id:7,chat:{id:1,type:'private'}}})};
 });
 assert.equal((await client.identity()).id,2);
 assert.deepEqual(await client.webhookStatus(),{configured:true,pendingUpdates:3});
 assert.deepEqual(await client.send(scope,'fixture'),{messageId:7});
 await assert.rejects(client.send({...scope,chatId:5},'fixture'));assert.equal(calls,3);
 await assert.rejects(client.send({...scope,botId:654321},'fixture'));assert.equal(calls,3);
 let failures=0;const broken=telegramNetwork(token,async()=>{failures++;throw Error('sensitive transport URL '+token)});
 await assert.rejects(broken.send(scope,'fixture'),e=>e.message==='Telegram operation unconfirmed'&&!e.message.includes(token));assert.equal(failures,1);
 console.log('PASS offline real-owner resolver and Telegram network boundary: revoked/inactive/unbound/wrong tenant/window, private target, no redirects/retries, secret-safe errors, redacted webhook status; network mocked');
})().catch(e=>{console.error(e);process.exitCode=1});
