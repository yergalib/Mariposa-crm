// Evaluation only. One direct request, no redirects/retries; no production changes.
const REQUEST_TIMEOUT_MS=90000;
function makeEvaluationTransport(keyBytes,request,report,timers={setTimeout,clearTimeout}){
 let key=keyBytes.toString('ascii');keyBytes.fill(0);
 if(!/^sk-[A-Za-z0-9_-]{20,500}$/.test(key)){key='';throw Error('Invalid key format')}
 report?.transportReady();
 return{maxRetries:0,baseURL:'https://api.openai.com/v1',dispose(){key=''},responses:{create(body,options){
  if(!key||options.maxRetries!==0)throw Error('Transport closed');
  return new Promise((resolve,reject)=>{
   let req,timer,settled=false;
   const finish=(error,value)=>{if(settled)return;settled=true;if(timer!==undefined)timers.clearTimeout(timer);if(error){report?.error(error.code);reject(error)}else resolve(value)};
   const fail=code=>{const error=Error(code);error.code=code;finish(error)};
   const timeout=()=>{if(settled)return;fail('EVALUATION_TIMEOUT');req?.destroy()};
   if(options.signal.aborted){fail('EVALUATION_ABORTED');return}
   const payload=JSON.stringify(body);report?.httpStart();
   try{
    req=request({hostname:'api.openai.com',port:443,path:'/v1/responses',method:'POST',agent:false,signal:options.signal,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{
     report?.httpStatus(res.statusCode);let size=0;const chunks=[];
     res.on('data',chunk=>{size+=chunk.length;if(size>262144){fail('EVALUATION_RESPONSE_TOO_LARGE');req?.destroy()}else chunks.push(chunk)});
     res.once('error',()=>fail('EVALUATION_RESPONSE_ERROR'));res.once('aborted',()=>fail('EVALUATION_RESPONSE_ERROR'));
     res.once('end',()=>{
      if(res.statusCode!==200){fail(res.statusCode===401?'HTTP_401':res.statusCode===429?'HTTP_429':res.statusCode>=500&&res.statusCode<=599?'HTTP_5XX':'HTTP_ERROR');return}
      try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));value.output_text=(value.output??[]).filter(x=>x.type==='message').flatMap(x=>x.content??[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');finish(null,value)}catch{fail('EVALUATION_RESPONSE_INVALID')}
     });
    });
    req.once('error',()=>fail(options.signal.aborted?'EVALUATION_ABORTED':'EVALUATION_TRANSPORT_ERROR'));
    // Socket inactivity plus absolute wall-time cap cover DNS/TLS and slow streams.
    req.setTimeout(REQUEST_TIMEOUT_MS,timeout);
    timer=timers.setTimeout(timeout,REQUEST_TIMEOUT_MS);
    req.end(payload);
   }catch{fail('EVALUATION_TRANSPORT_ERROR')}
  });
 }}};
}
module.exports={makeEvaluationTransport,REQUEST_TIMEOUT_MS};
