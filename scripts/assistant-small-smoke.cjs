const fs=require('node:fs'),path=require('node:path');
const {POLICY,check,claim,allowance}=require('./lib/assistant-small-smoke.cjs');
const dir=path.resolve(__dirname,'../../assistant-smoke-approval-20261016-144953');
async function readKey(){const chunks=[];let size=0;try{for await(const chunk of process.stdin){size+=chunk.length;if(size>512)throw Error('KEY_LENGTH');chunks.push(chunk)}return Buffer.concat(chunks)}finally{for(const c of chunks)c.fill(0)}}
async function main(){
 check(dir);const scenario=require('./assistant-small-smoke-fixture.cjs');
 if(process.argv[2]==='--check'){console.log('READY');return}
 if(process.argv[2]!=='--live')throw Error('MODE');
 claim(dir);let key,transport,a;
 try{key=await readKey();if(!/^sk-[A-Za-z0-9_-]{20,500}$/.test(key.toString('ascii')))throw Error('KEY_FORMAT');transport=require('./assistant-smoke-local.cjs').makeTransport(key,require('node:https').request);a=allowance(transport,dir);const outcome=await scenario(a,dir);const result={status:'LIVE_COMPLETED',attempts:a.count,reservedTokenUsd:a.reservedNano/1e9,...outcome};fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))}
 catch{const result={status:'STOPPED',attempts:a?.count??0,reservedTokenUsd:(a?.reservedNano??0)/1e9,noRetry:true};fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result));console.log(JSON.stringify(result));process.exitCode=2}
 finally{key?.fill(0);transport?.dispose()}
}
if(require.main===module){const timer=setTimeout(()=>process.exit(3),600000);main().catch(()=>{console.log('{"status":"STOPPED_BEFORE_KEY"}');process.exitCode=2}).finally(()=>{clearTimeout(timer);process.stdin.destroy()})}
