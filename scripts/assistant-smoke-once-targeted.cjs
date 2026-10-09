const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {reserveRun,wrapReservedProvider}=require('./lib/assistant-smoke-once.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-smoke-reservation-test-'));
if(process.argv[2]==='claim'){try{reserveRun(process.argv[3],Date.now()+60000);process.exit(0);}catch{process.exit(2);}}
(async()=>{
 const file=path.join(root,'concurrent.json');const claim=()=>new Promise(resolve=>{const c=spawn(process.execPath,[__filename,'claim',file],{stdio:'ignore',windowsHide:true});c.on('exit',resolve);});
 const claims=await Promise.all([claim(),claim(),claim(),claim()]);assert.equal(claims.filter(c=>c===0).length,1);assert.throws(()=>reserveRun(file,Date.now()+60000));
 let calls=0;const expires=Date.now()+60000;const provider=wrapReservedProvider({create:async()=>{calls++;throw Error('Synthetic timeout');}},expires);
 const body={model:'gpt-6-luna',store:false,reasoning:{effort:'none'},max_output_tokens:600,instructions:'Extract fictional criteria',input:[{role:'user',content:'Размер 140, любой цвет'}],text:{format:{type:'json_schema'}}};const signal=new AbortController().signal;
 for(let i=0;i<6;i++)await assert.rejects(()=>provider.create(body,signal),/Synthetic timeout/);await assert.rejects(()=>provider.create(body,signal),/allowance/);assert.equal(calls,6);
 const another=wrapReservedProvider({create:async()=>{throw Error('MUST NOT CALL');}},expires);for(const bad of [{...body,tools:[]},{...body,model:'other'},{...body,store:true},{...body,max_output_tokens:601},{...body,input:[{role:'user',content:[]} ]},{...body,instructions:'x'.repeat(24001)}])await assert.rejects(()=>another.create(bad,signal),/outside/);
 assert.equal(another.consumed,0);another.close();await assert.rejects(()=>another.create(body,signal),/closed/);
 const expired=wrapReservedProvider({},0);await assert.rejects(()=>expired.create(body,signal),/closed/);
 let release;const simultaneous=wrapReservedProvider({create:()=>new Promise(r=>release=r)},expires);const first=simultaneous.create(body,signal);await assert.rejects(()=>simultaneous.create(body,signal),/closed/);release({});await first;
 process.env.VERCEL_ENV='preview';assert.throws(()=>reserveRun(path.join(root,'serverless.json'),expires),/not a distributed/);delete process.env.VERCEL_ENV;
 console.log(JSON.stringify({status:'PASS',realProviderCalls:0,checks:'4 processes: one reservation; replay/crash fail closed; failed calls consume all six slots; concurrency/expiry/close; text/model/output/byte bounds; serverless refused',evidence:root},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
