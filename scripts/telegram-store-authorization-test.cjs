const assert=require('node:assert/strict'),Module=require('node:module');
require('./assistant-small-smoke-fixture.cjs');
global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
let allowed=true,locked=true,operations=0,authorizations=0;const order=[];
const tx={$queryRaw:async()=>{order.push('lock');return locked?[{id:'binding'}]:[]},$executeRaw:async()=>{order.push('operation');operations++;return 1}};
const load=Module._load;Module._load=function(k,...a){if(k==='@/lib/db')return{db:{$transaction:async f=>f(tx)}};return load.call(this,k,...a)};
const {telegramStore}=require('../lib/assistant/telegram/store.ts');
const store=telegramStore(async(s,client)=>{authorizations++;assert.equal(client,tx);order.push('authorize');if(!allowed)throw Error('REVOKED')});
const scope={organizationId:'org',membershipId:'owner',branchId:'branch',botId:1,userId:1,chatId:1,generation:'gen'};
(async()=>{
 assert.equal(await store.claim(scope,'1'),true);assert.deepEqual(order,['lock','authorize','operation']);assert.equal(authorizations,1);
 allowed=false;await assert.rejects(store.claim(scope,'2'),/REVOKED/);assert.equal(operations,1);
 locked=false;await assert.rejects(store.claim(scope,'3'),/binding unavailable/);assert.equal(operations,1);assert.equal(authorizations,2);
 console.log('PASS offline store: locked fresh transaction authorization before operations, revocation/unbound fail closed, no redundant pre-transaction reads.');
})().catch(e=>{console.error(e);process.exitCode=1});
