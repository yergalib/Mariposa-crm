// Observe the same request. Never record options, addresses, headers or messages.
const allowedCodes=new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','ENETUNREACH','EHOSTUNREACH','EPIPE','ABORT_ERR','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID']);
function observeTransport(request,save,now=()=>performance.now()){
 return (options,callback)=>{
  const started=now();let phase='request',timeoutMs=null,responseReceived=false,saved=false;
  const record=(reason,error)=>{if(saved)return;saved=true;try{save({reason,phase,elapsedMs:Math.max(0,Math.round(now()-started)),timeoutMs,responseReceived,code:allowedCodes.has(error?.code)?error.code:null})}catch{/* Diagnostics never change transport behavior. */}};
  const req=request(options,res=>{responseReceived=true;phase='response';res.once('error',e=>record('RESPONSE_ERROR',e));res.once('aborted',()=>record('RESPONSE_ABORTED'));callback(res)});
  req.once('error',e=>record(options.signal?.aborted?'INTERRUPTED':'REQUEST_ERROR',e));
  req.once('socket',socket=>{
   socket.once('lookup',error=>{phase='dns';if(error)record('DNS_ERROR',error)});
   socket.once('connect',()=>{phase='tcp'});
   socket.once('secureConnect',()=>{phase='tls'});
  });
  const setTimeout=req.setTimeout;
  req.setTimeout=function(ms,onTimeout){timeoutMs=Number.isSafeInteger(ms)&&ms>=0?ms:null;return setTimeout.call(this,ms,function(...args){record('REQUEST_TIMEOUT');return onTimeout?.apply(this,args)})};
  return req;
 };
}
module.exports={observeTransport};
