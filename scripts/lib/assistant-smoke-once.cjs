// Isolated single-executor harness ONLY. No key lookup, network on import or app enablement.
const fs=require('node:fs'),path=require('node:path');
const APPROVAL='Sentinel_d0591368cc308191bbfd7d9239e72a95';
// Pricing revalidated 2026-10-09. Fail closed after this UTC day; no timeless price claim.
const POLICY=Object.freeze({model:'gpt-6-luna',tier:'default',maxCalls:6,maxBytes:24000,maxInput:24000,maxOutput:600,
  ratesValidUntil:Date.parse('2026-10-10T00:00:00Z'),inputNano:100,cacheNano:10,writeNano:125,outputNano:500,
  // Worst input category + all output/reasoning, with 4x headroom, reserved per HTTP attempt.
  reserveNano:13200000,maxRunNano:79200000});
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
function requestSnapshot(body){
  const b=jsonSnapshot(body),keys=['model','service_tier','store','reasoning','max_output_tokens','instructions','input','text'];
  if(!b||Array.isArray(b)||Object.keys(b).some(k=>!keys.includes(k))||b.model!==POLICY.model||b.service_tier!==POLICY.tier||b.store!==false
    ||b.reasoning?.effort!=='none'||b.reasoning?.mode!=='standard'||Object.keys(b.reasoning).some(k=>!['effort','mode'].includes(k))
    ||b.max_output_tokens!==POLICY.maxOutput||typeof b.instructions!=='string'||!Array.isArray(b.input)||b.input.length!==1
    ||b.input[0]?.role!=='user'||typeof b.input[0]?.content!=='string'||Object.keys(b.input[0]).some(k=>!['role','content'].includes(k))
    ||!b.text||Object.keys(b.text).some(k=>k!=='format')||!['text','json_schema'].includes(b.text.format?.type))throw Error('Smoke request outside approved text-only bounds');
  return b;
}
function tokenCount(n){if(!Number.isSafeInteger(n)||n<0)throw Error('Uncertain token accounting');return n;}
function checkedUsage(response,inputTokens){
  const u=response?.usage;
  if(response?.model!==POLICY.model||response?.service_tier!==POLICY.tier||response?.status!=='completed'||!u)throw Error('Uncertain response accounting');
  const input=tokenCount(u.input_tokens),output=tokenCount(u.output_tokens),total=tokenCount(u.total_tokens);
  const cached=tokenCount(u.input_tokens_details?.cached_tokens),written=tokenCount(u.input_tokens_details?.cache_write_tokens),reasoning=tokenCount(u.output_tokens_details?.reasoning_tokens);
  if(input!==inputTokens||input>POLICY.maxInput||output>POLICY.maxOutput||reasoning>output||cached+written>input||total!==input+output)throw Error('Usage outside counted token bounds');
  return (input-cached-written)*POLICY.inputNano+cached*POLICY.cacheNano+written*POLICY.writeNano+output*POLICY.outputNano;
}
function wrapReservedProvider(client,expiresAt,now=()=>Date.now()) {
  // Accept the existing zero-retry OpenAI SDK client, not an opaque create callback.
  if(client.maxRetries!==0||client.baseURL!=='https://api.openai.com/v1'||typeof client.responses?.inputTokens?.count!=='function'||typeof client.responses?.create!=='function')throw Error('Verified zero-retry standard OpenAI client required');
  let consumed=0,busy=false,closed=false,reservedNano=0,observedNano=0;
  const assertActive=signal=>{if(closed||now()>=expiresAt||now()>=POLICY.ratesValidUntil||signal.aborted)throw Error('Smoke allowance closed');};
  const attempt=(signal)=>{assertActive(signal);if(consumed>=POLICY.maxCalls||reservedNano+POLICY.reserveNano>POLICY.maxRunNano)throw Error('Smoke allowance closed');consumed++;reservedNano+=POLICY.reserveNano;};
  return {close(){closed=true;},get consumed(){return consumed;},get reservedNano(){return reservedNano;},get observedNano(){return observedNano;},async create(body,signal){
    assertActive(signal);if(busy)throw Error('Smoke allowance closed');
    const b=requestSnapshot(body);
    if(consumed+2>POLICY.maxCalls)throw Error('Smoke allowance closed');
    busy=true;
    try {
      // Exact same model/instructions/messages/schema/reasoning in count and generation.
      const countBody=Object.freeze({model:b.model,instructions:b.instructions,input:b.input,text:b.text,reasoning:b.reasoning});
      const options={signal,maxRetries:0,timeout:25000};
      attempt(signal);
      const counted=await client.responses.inputTokens.count(countBody,options);
      if(counted?.object!=='response.input_tokens')throw Error('Uncertain input token count');
      const inputTokens=tokenCount(counted.input_tokens);
      if(inputTokens>POLICY.maxInput)throw Error('Input token limit exceeded');
      attempt(signal);
      const response=await client.responses.create(b,options);
      observedNano+=checkedUsage(response,inputTokens);
      return response;
    }catch(error){closed=true;throw error;}finally{busy=false;}
  }};
}
// Fixed approval ledger outside the checkout. Never delete/reset/refund or move executors.
async function runApprovedSmoke(client,operation){
  const expiresAt=Math.min(Date.now()+15*60000,POLICY.ratesValidUntil);
  const stateFile=path.resolve(__dirname,'../../../site-assistant-smoke-state',APPROVAL+'.json');
  reserveRun(stateFile,expiresAt);
  const limited=wrapReservedProvider(client,expiresAt);
  try{return await operation(limited);}finally{limited.close();}
}
module.exports={reserveRun,wrapReservedProvider,runApprovedSmoke,APPROVAL,POLICY};
