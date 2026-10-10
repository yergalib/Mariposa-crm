// Isolated single-executor harness ONLY. No key lookup, network on import or app enablement.
const fs=require('node:fs'),path=require('node:path');
const APPROVAL='Sentinel_d0591368cc308191bbfd7d9239e72a95';
// Pricing revalidated 2026-10-10. Fail closed after this UTC day; no timeless price claim.
const POLICY=Object.freeze({model:'gpt-6-luna',tier:'default',maxCalls:3,maxBytes:48000,contextWindow:1050000,maxOutput:1400,
  ratesValidUntil:Date.parse('2026-10-11T00:00:00Z'),inputNano:200,cacheNano:20,writeNano:250,outputNano:750,
  // Full-window long-context token charges, including the documented 10% regional premium.
  reserveNano:289905000,maxRunNano:869715000});
function reserveRun(stateFile,expiresAt,now=Date.now()) {
  if(process.env.VERCEL || process.env.VERCEL_ENV)throw Error('Isolated executor required; this is not a distributed quota');
  if(!path.isAbsolute(stateFile)||!Number.isFinite(expiresAt)||expiresAt<=now||expiresAt>now+15*60000||expiresAt>POLICY.ratesValidUntil)throw Error('Invalid isolated smoke scope or stale prices');
  fs.mkdirSync(path.dirname(stateFile),{recursive:true});
  const fd=fs.openSync(stateFile,'wx',0o600);
  try {fs.writeFileSync(fd,JSON.stringify({approval:APPROVAL,reservedUsd:1,maxCalls:POLICY.maxCalls,policy:POLICY,expiresAt}));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
}
function jsonSnapshot(value) {
  // Reject getters/toJSON/prototypes/non-JSON values before serialization; freeze an owned copy.
  function copy(v,depth=0){
    if(depth>40)throw Error('Smoke request outside JSON bounds');
    if(v===null||typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v)))return v;
    if(!v||typeof v!=='object'||(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype))throw Error('Smoke request outside JSON bounds');
    const out=Array.isArray(v)?[]:{};
    for(const key of Reflect.ownKeys(v)){
      if(Array.isArray(v)&&key==='length')continue;
      const d=Object.getOwnPropertyDescriptor(v,key);
      if(typeof key!=='string'||!d.enumerable||!('value' in d)||['__proto__','constructor','prototype','toJSON'].includes(key))throw Error('Smoke request outside JSON bounds');
      out[key]=copy(d.value,depth+1);
    }
    return Object.freeze(out);
  }
  const result=copy(value);
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>POLICY.maxBytes)throw Error('Smoke request outside byte bounds');
  return result;
}
const TOOL_NAMES=new Set(['get_product','get_rental_rules','list_branches','remember_preferences','find_dresses','more_dresses','read_variant','find_cheaper','read_batch']);
const keysOnly=(v,keys)=>v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).every(k=>keys.includes(k));
function requestSnapshot(body){
  const b=jsonSnapshot(body),keys=['model','service_tier','store','reasoning','max_output_tokens','instructions','input','text','tools','parallel_tool_calls','tool_choice'];
  const fail=()=>{throw Error('Smoke request outside approved conversation bounds');};
  if(!keysOnly(b,keys)||b.model!==POLICY.model||b.service_tier!==POLICY.tier||b.store!==false
    ||!keysOnly(b.reasoning,['effort','mode'])||b.reasoning.effort!=='none'||b.reasoning.mode!=='standard'
    ||!Number.isSafeInteger(b.max_output_tokens)||b.max_output_tokens<1||b.max_output_tokens>POLICY.maxOutput
    ||typeof b.instructions!=='string'||!Array.isArray(b.input)||!b.input.length||b.input.length>40
    ||!keysOnly(b.text,['format'])||!['text','json_schema'].includes(b.text.format?.type))fail();
  if(b.tools!==undefined){
    if(!Array.isArray(b.tools)||!b.tools.length||b.tools.length>TOOL_NAMES.size||b.parallel_tool_calls!==false||!['auto','none'].includes(b.tool_choice))fail();
    const seen=new Set();
    for(const t of b.tools){
      if(!keysOnly(t,['type','name','description','strict','parameters'])||t.type!=='function'||!TOOL_NAMES.has(t.name)||seen.has(t.name)||t.strict!==true||typeof t.description!=='string'||t.parameters?.type!=='object')fail();
      seen.add(t.name);
    }
  }else if(b.parallel_tool_calls!==undefined||b.tool_choice!==undefined)fail();
  const pending=new Set(),done=new Set();
  for(const item of b.input){
    if(item?.type==='function_call'){
      if(!keysOnly(item,['type','id','status','call_id','name','arguments'])||typeof item.call_id!=='string'||!item.call_id||done.has(item.call_id)||pending.has(item.call_id)||!b.tools?.some(t=>t.name===item.name)||typeof item.arguments!=='string')fail();
      pending.add(item.call_id);
    }else if(item?.type==='function_call_output'){
      if(!keysOnly(item,['type','id','status','call_id','output'])||!pending.delete(item.call_id)||typeof item.output!=='string')fail();
      done.add(item.call_id);
    }else if(item?.type==='reasoning'){
      if(!keysOnly(item,['type','id','summary'])||!Array.isArray(item.summary)||!item.summary.every(x=>keysOnly(x,['type','text'])&&x.type==='summary_text'&&typeof x.text==='string'))fail();
    }else{
      if(!keysOnly(item,['type','id','status','role','content'])||!['user','assistant'].includes(item.role)||(item.type!==undefined&&item.type!=='message'))fail();
      if(typeof item.content!=='string'&&!(item.role==='assistant'&&Array.isArray(item.content)&&item.content.every(x=>keysOnly(x,['type','text','annotations','logprobs'])&&x.type==='output_text'&&typeof x.text==='string'&&(!x.annotations||Array.isArray(x.annotations)&&!x.annotations.length))))fail();
    }
  }
  if(pending.size)fail();
  return b;
}

function tokenCount(n){if(!Number.isSafeInteger(n)||n<0)throw Error('Uncertain token accounting');return n;}
function checkedUsage(response,maxOutput){
  const u=response?.usage;
  if(response?.model!==POLICY.model||response?.service_tier!==POLICY.tier||response?.status!=='completed'||!u)throw Error('Uncertain response accounting');
  const input=tokenCount(u.input_tokens),output=tokenCount(u.output_tokens),total=tokenCount(u.total_tokens);
  const cached=tokenCount(u.input_tokens_details?.cached_tokens),written=tokenCount(u.input_tokens_details?.cache_write_tokens),reasoning=tokenCount(u.output_tokens_details?.reasoning_tokens);
  if(input>POLICY.contextWindow||total>POLICY.contextWindow||output>maxOutput||reasoning>output||cached+written>input||total!==input+output)throw Error('Usage outside model context/output bounds');
  // Conservative usage-based bound, not an account invoice or exact short-context charge.
  return Math.ceil(((input-cached-written)*POLICY.inputNano+cached*POLICY.cacheNano+written*POLICY.writeNano+output*POLICY.outputNano)*11/10);
}
// Generic live wrappers remain blocked. The explicit user-operated local entry below
// reuses this accounting core with the same durable claim. Unknown is never zero.
const LIVE_READINESS=Object.freeze({safeExecutorPrepared:false});
function requireLiveReady(){
  if(!LIVE_READINESS.safeExecutorPrepared)throw Error('LIVE_SMOKE_BLOCKED: safe executor and account charges not verified');
}
const reservedPermit=Symbol('single reserved run');
function wrapReservedProvider(client,expiresAt,now=()=>Date.now(),permit){
  requireLiveReady();
  if(permit!==reservedPermit)throw Error('Atomic run reservation required');
  if(client.maxRetries!==0||client.baseURL!=='https://api.openai.com/v1'||typeof client.responses?.create!=='function')throw Error('Verified zero-retry standard OpenAI client required');
  return createAllowance(client,expiresAt,now,POLICY.maxRunNano);
}

// One accounting engine for all dialogue turns and provider facades in a run.
// Shared by the in-memory test transport and the explicit user-operated local entry.
function createAllowance(client,expiresAt,now,remainingNano,report){
  tokenCount(remainingNano);
  if(remainingNano>POLICY.maxRunNano)throw Error('Budget outside approved ceiling');
  let consumed=0,busy=false,closed=false,reservedNano=0,observedNano=0;
  const assertActive=signal=>{if(closed||now()>=expiresAt||now()>=POLICY.ratesValidUntil||signal.aborted)throw Error('Smoke allowance closed');};
  const limited={close(){closed=true;},get consumed(){return consumed;},get reservedNano(){return reservedNano;},get observedNano(){return observedNano;},get remainingNano(){return remainingNano-reservedNano;},async create(body,signal){
    assertActive(signal);if(busy)throw Error('Smoke allowance closed');
    const b=requestSnapshot(body);
    // One synchronous admission, before any await: reserve a FULL window even for
    // errors/short output. Run ownership is exclusive/durable via reserveRun.
    // A crash consumes the whole one-shot approval; no restart, refunds or retries.
    if(consumed>=POLICY.maxCalls||POLICY.reserveNano>remainingNano-reservedNano)throw Error('Smoke allowance closed: insufficient budget or HTTP attempts');
    busy=true;consumed++;reservedNano+=POLICY.reserveNano;
    try{
      report?.admit(consumed,reservedNano);
      const options={signal,maxRetries:0,timeout:25000};
      const response=await client.responses.create(b,options);
      assertActive(signal);
      report?.providerStatus(response?.status);
      let verifiedNano;
      try{verifiedNano=checkedUsage(response,b.max_output_tokens);}catch(error){report?.error('USAGE_UNVERIFIED');throw error;}
      observedNano+=verifiedNano;
      report?.verified(response,verifiedNano);
      return response;
    }catch(error){closed=true;throw error;}finally{busy=false;}
  }};
  return limited;
}
function asChatProvider(limited){
  return Object.freeze({async create(body,signal){
    const r=await limited.create(body,signal);
    return {status:r.status??null,output:r.output,outputText:r.output_text,outputTokens:r.usage.output_tokens};
  }});
}
// Test-only fixture transport: never accepts an SDK client, URL, key or request callback.
// Plain JSON queues are snapshotted; only a local pause promise and clock are injectable.
function createSyntheticRun({steps,remainingNano=POLICY.maxRunNano,now=()=>Date.now(),expiresAt=now()+60000,pauseCreate}={}){
  const queue=jsonSnapshot(steps),calls=[];let index=0;
  const take=async(type,body,options)=>{
    calls.push({type,body,options});const step=queue[index++];
    if(!step||step.type!==type)throw Error('Synthetic script exhausted or out of order');
    if(type==='create'&&pauseCreate)await pauseCreate;
    if(step.error)throw Error(step.error);
    return step.value;
  };
  const limited=createAllowance({responses:{create:(b,o)=>take('create',b,o)}},expiresAt,now,remainingNano);
  return {limited,provider:asChatProvider(limited),calls,anotherProvider:()=>asChatProvider(limited)};
}
// Fixed approval ledger outside the checkout. Never reset/refund or move executors.
async function runApprovedSmoke(client,operation){
  // Fail BEFORE claiming the approval ledger or constructing any paid client.
  requireLiveReady();
  const expiresAt=Math.min(Date.now()+15*60000,POLICY.ratesValidUntil);
  const stateFile=path.resolve(__dirname,'../../../site-assistant-smoke-state',APPROVAL+'.json');
  reserveRun(stateFile,expiresAt);
  const limited=wrapReservedProvider(client,expiresAt,()=>Date.now(),reservedPermit);
  try{return await operation(asChatProvider(limited));}finally{limited.close();}
}
module.exports={reserveRun,wrapReservedProvider,runApprovedSmoke,createSyntheticRun,APPROVAL,POLICY,LIVE_READINESS};

// Explicit local user launcher only. Existing generic live entry stays blocked.
// Same approval, ledger and private accounting engine; no second allowance.
const localStateFile=path.resolve(__dirname,'../../../site-assistant-smoke-state',APPROVAL+'.json');
function checkUserLocalSmoke(){
  if(process.env.VERCEL||process.env.VERCEL_ENV||Date.now()>=POLICY.ratesValidUntil||fs.existsSync(localStateFile))throw Error('Local smoke unavailable or already reserved');
}
async function runUserLocalSmoke(makeClient,operation){
  checkUserLocalSmoke();
  const expiresAt=Math.min(Date.now()+2*60000,POLICY.ratesValidUntil);
  reserveRun(localStateFile,expiresAt);
  // Only the process that JUST claimed this ledger may create its result.
  const report=require('./assistant-smoke-result.cjs').createRunResult(localStateFile);
  let client,limited;
  const onExit=code=>{try{report.finish(code===3?'INTERRUPTED':'UNKNOWN',code===3?'TIMEOUT':'PROCESS_EXIT');}catch{}};
  const onInterrupt=()=>{try{report.finish('INTERRUPTED','INTERRUPTED');}finally{process.exit(130);}};
  process.once('exit',onExit);process.once('SIGINT',onInterrupt);process.once('SIGTERM',onInterrupt);process.once('SIGHUP',onInterrupt);
  try{
    client=await makeClient(report);
    if(client.maxRetries!==0||client.baseURL!=='https://api.openai.com/v1'||typeof client.responses?.create!=='function')throw Error('Invalid local transport');
    limited=createAllowance(client,expiresAt,()=>Date.now(),POLICY.maxRunNano,report);
    report.stage('SCENARIO_RUN');
    const result=await operation(asChatProvider(limited));
    report.finish('PASS','NONE',result?.comparisons?.length);
    return {result,attempts:limited.consumed,reservedNano:limited.reservedNano};
  }catch(error){report.finish('FAIL',limited?'SCENARIO_FAILED':client?'CLIENT_FAILED':'INPUT_FAILED');throw error;}
  finally{
    limited?.close();client?.dispose?.();
    process.removeListener('exit',onExit);process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onInterrupt);process.removeListener('SIGHUP',onInterrupt);
  }
}
module.exports.checkUserLocalSmoke=checkUserLocalSmoke;
module.exports.runUserLocalSmoke=runUserLocalSmoke;
