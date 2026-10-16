// Observe the SAME request, without changing options, redirects, retries or auth.
const codes=new Set(['invalid_api_key','incorrect_api_key','missing_api_key','invalid_organization','organization_deactivated','account_deactivated','permission_denied','insufficient_permissions','model_not_found','ip_not_authorized','invalid_project','project_not_found','credit_balance_exhausted']);
const types=new Set(['invalid_request_error','authentication_error','permission_error','server_error','rate_limit_error']);
function sanitize(status,requestId,error){return{status:Number.isInteger(status)&&status>=100&&status<=599?status:null,requestId:typeof requestId==='string'&&/^req_[a-zA-Z0-9]{8,128}$/.test(requestId)?requestId:null,code:codes.has(error?.code)?error.code:null,type:types.has(error?.type)?error.type:null}}
function diagnosticRequest(request,save){
 return (options,callback)=>request(options,res=>{
  if(res.statusCode!==200){let size=0,oversized=false,chunks=[];
   res.on('data',chunk=>{size+=chunk.length;if(size>16384){oversized=true;for(const c of chunks)c.fill(0);chunks=[]}else if(!oversized)chunks.push(Buffer.from(chunk))});
   const clear=()=>{for(const c of chunks)c.fill(0);chunks=[]};
   res.once('end',()=>{let parsed;try{if(!oversized)parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{}finally{clear()}
    // Never save message, param, body, auth headers, account identifiers or cookies.
    save(sanitize(res.statusCode,res.headers?.['x-request-id'],parsed?.error));parsed=null;
   });res.once('error',clear);res.once('aborted',clear);
  }
  callback(res);
 });
}
module.exports={sanitize,diagnosticRequest};
