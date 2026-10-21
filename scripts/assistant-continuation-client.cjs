const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const loaded={exports:{}};
vm.runInNewContext('(function(exports){'+ts.transpileModule(fs.readFileSync('lib/assistant/chat/continuation-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'})',{setTimeout:fn=>setTimeout(fn,0),clearTimeout})(loaded.exports);
const call=loaded.exports.requestContinuedTurn,key='fixture-key',signal=new AbortController().signal;
(async()=>{
 const seen=[];let n=0;
 const result=await call({messages:['fixture']},key,false,signal,async(url,options)=>{seen.push(JSON.parse(options.body));assert.equal(options.headers['x-assistant-turn'],key);return ++n===1?new Response(JSON.stringify({continuation:{status:'pending',key}}),{status:202}):new Response(JSON.stringify({message:'fixture verified'}));});
 assert.equal(result.status,200);assert.deepEqual(seen,[{messages:['fixture']},{resumeKey:key}]);
 n=0;await assert.rejects(call({},key,false,signal,async()=>{n++;throw Error('transport lost')}));assert.equal(n,1,'no automatic repeat after uncertain planning');
 let resume;await call({},key,true,signal,async(_,options)=>{resume=JSON.parse(options.body);return new Response('{}')});assert.deepEqual(resume,{resumeKey:key});
 n=0;await assert.rejects(call({},key,false,signal,async()=>{n++;return new Response(JSON.stringify({continuation:{status:'pending',key:'wrong'}}),{status:202})}));assert.equal(n,1);
 console.log('PASS UI transport: one initial POST, scoped continuation key, manual recovery only, no automatic retry on network loss or mismatched response');
})().catch(e=>{console.error(e);process.exitCode=1});
