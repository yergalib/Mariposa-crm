const assert=require('node:assert/strict'),Module=require('module');require('./assistant-small-smoke-fixture.cjs');
global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const {telegramNetwork}=require('../lib/assistant/telegram/network.ts');
const scope={enabled:true,consent:true,botId:123456,userId:11,chatId:11,start:Date.now()-1000,until:Date.now()+100000,organizationId:'fixture'};
let calls=0;
const transport=async(url,options)=>{calls++;assert.ok(url.endsWith('/sendPhoto'));assert.equal(options.redirect,'error');assert.ok(options.body instanceof FormData);assert.ok(options.body.get('photo') instanceof Blob);assert.equal(options.body.get('caption'),'Verified item');return {ok:true,json:async()=>({ok:true,result:{message_id:1,chat:{id:11,type:'private'}}})}};
(async()=>{
 const network=telegramNetwork('123456:'+'x'.repeat(30),transport),blob=new Blob(['RIFF0000WEBP'],{type:'image/webp'});
 assert.equal((await network.media(scope,[blob],'Verified item')).messageId,1);assert.equal(calls,1);
 await assert.rejects(network.media({...scope,chatId:12},[blob],'x'),/denied/);assert.equal(calls,1);
 await assert.rejects(network.media(scope,[blob],'x'.repeat(1025)),/denied/);assert.equal(calls,1);
 const fail=telegramNetwork('123456:'+'x'.repeat(30),async()=>{calls++;throw Error('sensitive URL must not escape')});
 await assert.rejects(fail.media(scope,[blob],'x'),e=>e.message==='Telegram media unconfirmed');assert.equal(calls,2);
 let reads=0,media=0,sent=0;const load=Module._load;
 Module._load=function(k,...a){
  if(k==='@/lib/db')return {db:{$queryRaw:async()=>[{id:'turn'}],$executeRaw:async()=>1}};
  if(k==='@/lib/showroom/photos')return {publicPhotos:async(org,group)=>{assert.equal(org,'fixture');assert.equal(group.executionId,'execution');return [{id:'approved'}]},readPublicPhoto:async(org,ref)=>{assert.equal(ref.imageId,'approved');assert.equal(ref.executionId,'execution');reads++;return blob}};
  if(k==='./customer-access')return {authorizeCustomer:async()=>{}};
  if(k==='./network')return {telegramNetwork:()=>({media:async()=>{media++;return {messageId:2}},send:async()=>{sent++;return {messageId:3}}})};
  return load.call(this,k,...a);
 };
 process.env.MARIPOSA_TELEGRAM_REQUESTS='confirmed-v1';
 const {customerReplyDelivery}=require('../lib/assistant/telegram/customer-reply-delivery.ts');
 const reply={message:'Here',cards:[{productId:'product',executionId:'execution',item:{name:'Fixture',size:'140'},images:[{src:'https://malicious.invalid/private'}]}]};
 await customerReplyDelivery('unused',scope,reply,'Verified item',1);assert.equal(media,1);assert.equal(reads,1);assert.equal(sent,1);
 await customerReplyDelivery('unused',scope,reply,'x'.repeat(2000),2);assert.equal(sent,2);assert.equal(media,2);
 console.log('PASS synthetic media transport: same private chat, bounded caption, one call on failure, redacted errors, existing execution-specific metadata only; model URL ignored. Long reply retains text plus photos in separate claimed delivery parts.');
})().catch(e=>{console.error(e);process.exitCode=1});
