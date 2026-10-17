// Isolated, text-only, one-shot smoke. No environment/key discovery or network here.
const fs=require('node:fs'),path=require('node:path');
const POLICY=Object.freeze({approval:'Sentinel_c5b1ced99a648191a5c8f3dbe62bff83',model:'gpt-6-luna',maxBytes:48000,maxCalls:12,maxTurns:3,maxOutput:1400,budgetNano:250000000,validUntil:Date.parse('2026-10-17T00:00:00Z'),inputBound:128768,reserveNano:18475600});
const names=new Set(['get_contacts','get_product','get_rental_rules','list_branches','remember_preferences','find_dresses','more_dresses','read_variant','find_cheaper','read_batch']);
function snapshot(raw){
  let nodes=0;
  function copy(v,depth=0){
    if(++nodes>4000||depth>30)throw Error('PAYLOAD_SHAPE');
    if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return v;
    if(!v||typeof v!=='object'||!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype)throw Error('PAYLOAD_SHAPE');
    const r=Array.isArray(v)?[]:{};
    for(const k of Reflect.ownKeys(v)){if(Array.isArray(v)&&k==='length')continue;const d=Object.getOwnPropertyDescriptor(v,k);if(typeof k!=='string'||!d.enumerable||!('value'in d)||['__proto__','prototype','constructor','toJSON'].includes(k))throw Error('PAYLOAD_SHAPE');if(k==='$ref'&&(typeof d.value!=='string'||!d.value.startsWith('#/')))throw Error('REMOTE_SCHEMA');r[k]=copy(d.value,depth+1)}return Object.freeze(r);
  }
  const b=copy(raw),only=(v,keys)=>v&&Object.keys(v).every(k=>keys.includes(k));
  if(Buffer.byteLength(JSON.stringify(b))>POLICY.maxBytes)throw Error('PAYLOAD_LIMIT');
  if(!only(b,['model','store','service_tier','reasoning','max_output_tokens','instructions','input','text','tools','parallel_tool_calls','tool_choice'])||b.model!==POLICY.model||b.store!==false||b.service_tier!=='default'||b.reasoning?.effort!=='none'||b.reasoning?.mode!=='standard'||!only(b.reasoning,['effort','mode'])||b.parallel_tool_calls!==false||!['auto','none'].includes(b.tool_choice)||!Number.isSafeInteger(b.max_output_tokens)||b.max_output_tokens<1||b.max_output_tokens>POLICY.maxOutput||typeof b.instructions!=='string'||!Array.isArray(b.input)||b.input.length>24||!Array.isArray(b.tools)||b.tools.length>10||!only(b.text,['format'])||b.text.format?.type!=='json_schema'||b.text.format.strict!==true||!['consultant_reply','conversation_boundary_review'].includes(b.text.format.name))throw Error('REQUEST_POLICY');
  if(b.text.format.name==='conversation_boundary_review'&&(b.tools.length||b.max_output_tokens>300||Buffer.byteLength(JSON.stringify(b))>8000))throw Error('REVIEW_POLICY');
  for(const tool of b.tools)if(tool.type!=='function'||!names.has(tool.name)||tool.strict!==true||!only(tool,['type','name','description','parameters','strict']))throw Error('TOOLS_POLICY');
  for(const item of b.input){
    if(item.type==='function_call'){if(!only(item,['type','id','status','call_id','name','arguments'])||!names.has(item.name)||typeof item.arguments!=='string')throw Error('INPUT_POLICY')}
    else if(item.type==='function_call_output'){if(!only(item,['type','id','status','call_id','output'])||typeof item.output!=='string')throw Error('INPUT_POLICY')}
    else if(item.type==='reasoning'){if(!only(item,['type','id','summary'])||!Array.isArray(item.summary)||!item.summary.every(v=>only(v,['type','text'])&&v.type==='summary_text'&&typeof v.text==='string'))throw Error('INPUT_POLICY')}
    else if(!only(item,['type','id','status','role','content'])||!['user','assistant'].includes(item.role)||item.type!==undefined&&item.type!=='message'||!(typeof item.content==='string'||item.role==='assistant'&&Array.isArray(item.content)&&item.content.every(v=>only(v,['type','text','annotations','logprobs'])&&v.type==='output_text'&&typeof v.text==='string'&&(!v.annotations||v.annotations.length===0))))throw Error('INPUT_POLICY');
  }
  return b;
}
function usage(r,cap){
  const u=r?.usage,n=v=>Number.isSafeInteger(v)&&v>=0;
  if(r?.status!=='completed'||r.model!==POLICY.model||r.service_tier!=='default'||!u)throw Error('UNKNOWN_USAGE');
  const c=u.input_tokens_details?.cached_tokens,w=u.input_tokens_details?.cache_write_tokens,o=u.output_tokens,i=u.input_tokens;
  if(![i,o,u.total_tokens,c,w,u.output_tokens_details?.reasoning_tokens].every(n)||i>POLICY.inputBound||o>cap||c+w>i||u.total_tokens!==i+o||u.output_tokens_details.reasoning_tokens>o)throw Error('UNKNOWN_USAGE');
  return {input_tokens:i,output_tokens:o,total_tokens:u.total_tokens,cached_tokens:c,cache_write_tokens:w,estimatedNano:Math.ceil(((i-c-w)*100+c*10+w*125+o*500)*11/10)};
}
function check(dir,now=Date.now()){
  if(process.env.VERCEL||process.env.VERCEL_ENV||now>=POLICY.validUntil)throw Error('ISOLATION_OR_PRICE');
  if(fs.existsSync(path.join(dir,'started.json')))throw Error('APPROVAL_ALREADY_USED');
}
function claim(dir,now=Date.now()){
  check(dir,now);fs.mkdirSync(dir,{recursive:true});const fd=fs.openSync(path.join(dir,'started.json'),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({approval:POLICY.approval,budgetNano:POLICY.budgetNano,expiresAt:Math.min(now+15*60000,POLICY.validUntil)}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
function allowance(transport,dir,now=()=>Date.now(),options={}){
  const initialCount=options.initialCount??0,maxTurns=options.maxTurns??POLICY.maxTurns,maxCalls=options.maxCalls??POLICY.maxCalls;
  const cumulativeCeiling=Math.floor(POLICY.budgetNano/POLICY.reserveNano);
  if(!Number.isInteger(initialCount)||initialCount<0||initialCount>cumulativeCeiling||!Number.isInteger(maxCalls)||maxCalls<initialCount||maxCalls>cumulativeCeiling||!Number.isInteger(maxTurns)||maxTurns<1||maxTurns>POLICY.maxTurns)throw Error('ALLOWANCE_OPTIONS');
  let count=initialCount,turns=0,busy=false,closed=false;const expires=Math.min(now()+15*60000,POLICY.validUntil);
  const valid=()=>{if(closed||now()>=expires)throw Error('ALLOWANCE_CLOSED')};
  return {beginTurn(){valid();if(++turns>maxTurns){closed=true;throw Error('TURN_LIMIT')}},get count(){return count},get reservedNano(){return count*POLICY.reserveNano},get closed(){return closed},provider:{async create(raw,signal){
    valid();if(signal.aborted||busy||turns<1)throw Error('ALLOWANCE_CLOSED');const body=snapshot(raw);
    if(count>=maxCalls||(count+1)*POLICY.reserveNano>POLICY.budgetNano)throw Error('BUDGET_LIMIT');
    busy=true;count++;let stage='DURABLE_DEBIT',observed=null;
    try{
      // Durable debit BEFORE transport; unknown usage/crash never refunds or retries.
      const fd=fs.openSync(path.join(dir,`attempt-${count}.json`),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({attempt:count,turn:turns,reservedNano:count*POLICY.reserveNano,payloadBytes:Buffer.byteLength(JSON.stringify(body))}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
      valid();if(signal.aborted)throw Error('ABORTED');stage='TRANSPORT';
      const r=await transport.responses.create(body,{signal,maxRetries:0,timeout:25000});stage='RESPONSE_VALIDATION';
      // Strict metadata allowlist: never retain provider text, errors, headers or IDs.
      const number=v=>Number.isSafeInteger(v)&&v>=0?v:null;
      observed={completed:r?.status==='completed',modelMatches:r?.model===POLICY.model,tierMatches:r?.service_tier==='default',inputTokens:number(r?.usage?.input_tokens),outputTokens:number(r?.usage?.output_tokens),totalTokens:number(r?.usage?.total_tokens),cachedTokens:number(r?.usage?.input_tokens_details?.cached_tokens),cacheWriteTokens:number(r?.usage?.input_tokens_details?.cache_write_tokens),reasoningTokens:number(r?.usage?.output_tokens_details?.reasoning_tokens)};
      valid();if(signal.aborted)throw Error('ABORTED');const u=usage(r,body.max_output_tokens);stage='USAGE_WRITE';
      fs.writeFileSync(path.join(dir,`usage-${count}.json`),JSON.stringify(u));
      return{status:r.status,output:r.output,outputText:r.output_text,outputTokens:u.output_tokens};
    }catch{closed=true;try{fs.writeFileSync(path.join(dir,`failure-${count}.json`),JSON.stringify({stage,observed,aborted:signal.aborted,noRetry:true}),{flag:'wx',mode:0o600})}catch{}throw Error('SMOKE_STOPPED_NO_RETRY')}finally{busy=false}
  }}};
}
module.exports={POLICY,snapshot,usage,check,claim,allowance};
