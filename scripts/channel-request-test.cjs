const assert=require('node:assert/strict');
require('./assistant-small-smoke-fixture.cjs');
global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const {prepareChannelRequest,confirmChannelRequest}=require('../lib/inquiries/confirmed-channel-request.ts');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let rows=new Map(),creates=0,denied=false,changed=false,failReceipt=false,tail=Promise.resolve();
const store={transaction:fn=>{const op=tail.then(async()=>{const before=structuredClone(rows),count=creates;try{return await fn({
 authorize:async()=>{if(denied)throw Error('DENIED')},read:async key=>rows.get(key)||null,
 validate:async()=>({summary:['Actual public catalog quote; no reservation'],fingerprint:changed?'changed':'original'}),
 stage:async(draft,quote)=>{const row={id:id(rows.size+1),draft,quote,expiresAt:Date.now()+600000,inquiryId:null};rows.set(row.id,row);return structuredClone(row)},
 create:async()=>{creates++;return id(99)},receipt:async(key,receipt)=>{if(failReceipt)throw Error('RECEIPT_FAIL');rows.get(key).inquiryId=receipt},
 })}catch(e){rows=before;creates=count;throw e}});tail=op.catch(()=>{});return op}};
(async()=>{
 const draft={contact:'synthetic@example.invalid',variantIds:[id(20)],from:'2026-10-23',until:'2026-10-24'};
 const staged=await prepareChannelRequest(draft,store);assert.equal(creates,0);
 assert.throws(()=>confirmChannelRequest(staged.id,false,store),/CONFIRMATION/);
 changed=true;assert.equal((await confirmChannelRequest(staged.id,true,store)).status,'changed');assert.equal(creates,0);changed=false;
 failReceipt=true;await assert.rejects(confirmChannelRequest(staged.id,true,store),/RECEIPT_FAIL/);assert.equal(creates,0);assert.equal(rows.get(staged.id).inquiryId,null);failReceipt=false;
 const result=await Promise.all([confirmChannelRequest(staged.id,true,store),confirmChannelRequest(staged.id,true,store)]);assert.equal(creates,1);assert.equal(result[0].inquiryId,result[1].inquiryId);
 assert.equal((await confirmChannelRequest(staged.id,true,store,Date.now()+900000)).inquiryId,id(99));assert.equal(creates,1);
 const next=await prepareChannelRequest(draft,store);await assert.rejects(confirmChannelRequest(next.id,true,store,Date.now()+900000),/EXPIRED/);
 await assert.rejects(confirmChannelRequest(id(777),true,store),/NOT_FOUND/);
 denied=true;await assert.rejects(confirmChannelRequest(staged.id,true,store),/DENIED/);
 assert.throws(()=>prepareChannelRequest({...draft,price:'1'},store));
 assert.throws(()=>prepareChannelRequest({...draft,variantIds:[id(20),id(20)]},store));
 console.log('PASS channel-independent confirmation: explicit confirmation, quote change, atomic rollback, duplicate/concurrent confirmation, expired draft, committed receipt after expiry, missing/denied principal, payload strictness. In-memory transaction; no live records/model/network.');
})().catch(e=>{console.error(e);process.exitCode=1});
