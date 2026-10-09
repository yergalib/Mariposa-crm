// Isolated single-executor harness ONLY. Never a Vercel/distributed quota.
// No credentials, model client, application enablement or network in this module.
const fs=require('node:fs'),path=require('node:path');
const APPROVAL='Sentinel_d0591368cc308191bbfd7d9239e72a95';
const MAX_CALLS=6, MAX_BYTES=24000, MAX_OUTPUT=600;
function reserveRun(stateFile,expiresAt,now=Date.now()) {
  if(process.env.VERCEL || process.env.VERCEL_ENV)throw Error('Isolated executor required; this is not a distributed quota');
  if(!path.isAbsolute(stateFile)||!Number.isFinite(expiresAt)||expiresAt<=now||expiresAt>now+15*60000)throw Error('Invalid isolated smoke scope');
  // An existing reservation, even after failure/crash, is never reset/refunded.
  fs.mkdirSync(path.dirname(stateFile),{recursive:true});
  const fd=fs.openSync(stateFile,'wx',0o600);
  try {fs.writeFileSync(fd,JSON.stringify({approval:APPROVAL,reservedUsd:1,maxCalls:MAX_CALLS,expiresAt}));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
}
function wrapReservedProvider(provider,expiresAt,now=()=>Date.now()) {
  let consumed=0,busy=false,closed=false;
  return {close(){closed=true;},get consumed(){return consumed;},async create(body,signal){
    if(closed||busy||consumed>=MAX_CALLS||now()>=expiresAt||signal.aborted)throw Error('Smoke allowance closed');
    const keys=['model','store','reasoning','max_output_tokens','instructions','input','text'];
    if(Object.keys(body).some(k=>!keys.includes(k))||body.model!=='gpt-6-luna'||body.store!==false||body.reasoning?.effort!=='none'||body.max_output_tokens!==MAX_OUTPUT
      ||typeof body.instructions!=='string'||!Array.isArray(body.input)||body.input.length!==1||body.input[0].role!=='user'||typeof body.input[0].content!=='string'
      ||Object.keys(body.input[0]).some(k=>!['role','content'].includes(k))||Buffer.byteLength(JSON.stringify(body),'utf8')>MAX_BYTES)throw Error('Smoke request outside approved text-only bounds');
    consumed++;busy=true;
    try{return await provider.create(body,signal);}finally{busy=false;}
  }};
}
// One fixed state location per approval, shared by all processes in this checkout.
// No custom path/reset flag in a live runner. Moving/deleting this ledger is not allowed.
async function runApprovedSmoke(provider,operation){
  const expiresAt=Date.now()+15*60000;
  const stateFile=path.resolve(__dirname,'../../../site-assistant-smoke-state',APPROVAL+'.json');
  reserveRun(stateFile,expiresAt);
  const limited=wrapReservedProvider(provider,expiresAt);
  try{return await operation(limited);}finally{limited.close();}
}
module.exports={reserveRun,wrapReservedProvider,runApprovedSmoke,APPROVAL};
