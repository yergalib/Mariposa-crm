// Built Next server with a sanitized environment; no CRM cookies or real DB.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-guest-assets-'));
const env={};for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE','COMSPEC'])if(process.env[key])env[key]=process.env[key];
Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:'postgresql://unused:unused@127.0.0.1:1/unused'});
let child;
(async()=>{assert(!fs.readdirSync(root).some(n=>/^\.env(?:\.|$)/.test(n)&&n!=='.env.example'),'No local env files allowed');
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env,windowsHide:true});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const origin='http://127.0.0.1:'+port;let ready=false;
 for(let i=0;i<100;i++){try{await fetch(origin+'/favicon.ico');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert(ready,'Next server starts');
 const paths=[...fs.readFileSync(path.join(root,'app/showroom/hero-slides.ts'),'utf8').matchAll(/src: "(\/brand\/hero\/[^\"]+\.webp)"/g)].map(m=>m[1]);assert.equal(paths.length,6);
 const results=[];
 for(const asset of paths){const response=await fetch(origin+asset,{redirect:'manual'}),bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(response.status,200,asset);assert.equal(response.headers.get('location'),null);assert.match(response.headers.get('content-type'),/^image\/webp/);
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');assert.deepEqual(bytes,fs.readFileSync(path.join(root,'public',asset)));
  results.push({asset,status:response.status,type:response.headers.get('content-type'),bytes:bytes.length});
 }
 for(const route of ['/orders','/brand/hero/not-approved.webp']){const r=await fetch(origin+route,{redirect:'manual'});assert.equal(r.status,307);assert.equal(new URL(r.headers.get('location'),origin).pathname,'/login');}
 const api=await fetch(origin+'/api/v1/orders',{redirect:'manual'});assert.equal(api.status,401);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,crmPage:'307 /login',unknownHero:'307 /login',crmApi:401},null,2));fs.writeFileSync(path.join(out,'server.log'),logs);
 console.log(JSON.stringify({status:'PASS',checks:'Six real WebP byte-for-byte HTTP200 image/webp without cookie; unknown hero and CRM routes remain protected',output:out,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(child)child.kill();});
