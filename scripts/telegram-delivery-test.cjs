const assert=require('node:assert/strict');require('./assistant-small-smoke-fixture.cjs');
global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const {deliverTelegram}=require('../lib/assistant/telegram/delivery.ts');
(async()=>{
 for(const failure of ['none','send','receipt']){
  let state='unsent',sends=0;
  const ports={authorize:async()=>{},claim:async()=>{if(state!=='unsent')return false;state='sending';return true},send:async()=>{sends++;if(failure==='send')throw Error('timeout');return {messageId:1}},receipt:async()=>{if(failure==='receipt')throw Error('lost commit');state='sent'},unknown:async()=>{state='unknown'}};
  await Promise.all([deliverTelegram({},'1','fixture',ports),deliverTelegram({},'1','fixture',ports)]);
  assert.equal(sends,1);assert.equal(state,failure==='none'?'sent':'unknown');
  await deliverTelegram({},'1','fixture',ports);assert.equal(sends,1);
 }
 console.log('PASS offline outbound claim: concurrent send once, unknown delivery/receipt never retried; no Telegram client');
})().catch(e=>{console.error(e);process.exitCode=1});
