const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {observeTransport}=require('./lib/assistant-transport-diagnostic.cjs');
const {makeTransport}=require('./assistant-smoke-local.cjs');
(async()=>{
 for(const mode of ['timeout','dns','tls','reset','unknown','abort']){
  let time=0,calls=0,timeoutCallback;const records=[];
  const request=(options,_callback)=>{calls++;assert.equal(options.hostname,'api.openai.com');const req=new EventEmitter();req.setTimeout=(ms,cb)=>{assert.equal(ms,25000);timeoutCallback=cb;return req};req.destroy=()=>req.emit('error',{code:'ECONNRESET',message:'DO_NOT_SAVE'});req.end=()=>{const socket=new EventEmitter();req.emit('socket',socket);if(mode==='timeout'){socket.emit('connect');socket.emit('secureConnect');time=25085;timeoutCallback()}else if(mode==='dns'){socket.emit('lookup',{code:'ENOTFOUND',address:'DO_NOT_SAVE'});req.emit('error',{code:'ENOTFOUND'})}else{if(mode==='abort')controller.abort();req.emit('error',{code:mode==='tls'?'CERT_HAS_EXPIRED':mode==='reset'?'ECONNRESET':mode==='abort'?'ABORT_ERR':'DO_NOT_SAVE',message:'DO_NOT_SAVE'})}};return req};
  const controller=new AbortController(),signal=controller.signal;
  const transport=makeTransport(Buffer.from('sk-SYNTHETIC_ONLY_12345678901234567890'),observeTransport(request,r=>records.push(r),()=>time));
  await assert.rejects(()=>transport.responses.create({synthetic:true},{signal,maxRetries:0}));transport.dispose();assert.equal(calls,1);assert.equal(records.length,1);assert(!JSON.stringify(records).includes('DO_NOT_SAVE'));
  if(mode==='timeout'){assert.equal(records[0].reason,'REQUEST_TIMEOUT');assert.equal(records[0].elapsedMs,25085);assert.equal(records[0].timeoutMs,25000);assert.equal(records[0].phase,'tls');assert.equal(records[0].responseReceived,false)}
  if(mode==='abort')assert.equal(records[0].reason,'INTERRUPTED');
  if(mode==='dns')assert.equal(records[0].code,'ENOTFOUND');if(mode==='unknown')assert.equal(records[0].code,null);
 }
 // Success still uses the identical request options and response callback.
 let saved=0,seen;const options={safe:true};const req=new EventEmitter();req.setTimeout=()=>req;
 const wrapped=observeTransport((received,callback)=>{assert.equal(received,options);const res=new EventEmitter();callback(res);return req},()=>saved++);assert.equal(wrapped(options,r=>{seen=r}),req);assert(seen);assert.equal(saved,0);
 console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,sameRequest:true,automaticRetries:0,checks:['timeout distinguished from socket reset','DNS and TLS allowlist','unknown codes stripped','no headers/messages/addresses saved','success unchanged']}));
})().catch(e=>{console.error(e);process.exitCode=1});
