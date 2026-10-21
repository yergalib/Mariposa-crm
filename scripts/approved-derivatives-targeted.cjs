// Local synthetic Storage/DB only; no credentials, network or business records.
const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict'),sharp=require('sharp');
const manifest=require('../lib/catalog/approved-derivatives-20261021.json');
const org='2157bde1-1994-465b-9f80-e1b740ee3cb1';
let objects,denied,changed,writeClosed,uploadMode,uploads,authCalls,now;
const FakeDate=class extends Date{static now(){return now}};
function load(file,deps){const m={exports:{}};vm.runInNewContext('(function(require,module,exports){'+ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText+'})',{Date:FakeDate,Uint8Array,Set,Response,URL,JSON})(n=>n in deps?deps[n]:require(n),m,m.exports);return m.exports}
const pipeline=load('lib/catalog/image-renditions.ts',{});
const bucket={
 download:async k=>objects.has(k)?{data:new Blob([objects.get(k)])}:{error:{code:'404'}},
 exists:async()=>{throw Error('Storage exists has ambiguous missing-object errors; use metadata readback')},
 upload:async(k,data,options)=>{assert.equal(options.upsert,false);assert.equal(options.contentType,'image/webp');assert(k.endsWith('.catalog.webp')||k.endsWith('.site.webp'));assert(!objects.has(k));uploads.push(k);
 if(uploadMode==='fail-second'&&uploads.length===2)return{error:{code:'503'}};
 objects.set(k,Buffer.from(data));return uploadMode==='uncertain'?{error:{code:'503'}}:{};}
};
const deps={'server-only':{},'@/lib/db':{db:{$queryRaw:async(strings,keys)=>JSON.parse(keys).filter(k=>objects.has(k)).map(name=>({name})),productImage:{findFirst:async q=>{assert.equal(q.where.organizationId,org);assert.equal(q.where.executionId,null);return changed?null:{id:q.where.id}}}}},
 '@/lib/assistant/owner-day-access':{requireOwnerDaySession:async permissions=>{authCalls++;assert(permissions.includes('CATALOG_PHOTO_MANAGE'));if(denied)throw Error('denied')},requireOwnerDayWriteWindow:async()=>{if(writeClosed)throw Error('closed')}},
 '@/lib/assistant/owner-day-config':{OWNER_DAY:{organizationId:org}},
 '@/lib/storage/client':{PRODUCT_IMAGES_BUCKET:'product-images',getStorageClient:()=>({storage:{from:b=>{assert.equal(b,'product-images');return bucket}}})},
 './image-renditions':pipeline,'./approved-derivatives-20261021.json':manifest};
const service=load('lib/catalog/approved-derivatives-repair.ts',deps);
let source,derived;
function reset(){objects=new Map();denied=changed=writeClosed=false;uploadMode='ok';uploads=[];authCalls=0;now=Date.parse('2026-10-21T16:00:00Z');for(const row of manifest){objects.set(row.storageKey,source);for(const kind of ['catalog','site'])objects.set(pipeline.renditionStorageKey(row.storageKey,kind),derived.find(r=>r.rendition===kind).data)}}
function missing(index=0){for(const kind of ['catalog','site'])objects.delete(pipeline.renditionStorageKey(manifest[index].storageKey,kind))}
(async()=>{
 source=await sharp({create:{width:900,height:600,channels:3,background:'#abcdef'}}).jpeg().toBuffer();
 derived=await pipeline.renderProductImageRenditions(source);
 assert.equal(manifest.length,62);assert.equal(new Set(manifest.map(r=>r.storageKey)).size,62);
 reset();missing();const result=await service.repairNextApprovedSource();assert.equal(result.results.length,2);assert.equal(uploads.length,2);assert.equal(authCalls,5);assert(objects.get(manifest[0].storageKey).equals(source));assert(result.results.every(r=>r.outcome==='created'&&r.sha256.length===64));
 const again=await service.repairNextApprovedSource();assert.equal(again.done,true);assert.equal(uploads.length,2);
 reset();missing();denied=true;await assert.rejects(service.repairNextApprovedSource);assert.equal(uploads.length,0);
 reset();missing();writeClosed=true;await assert.rejects(service.repairNextApprovedSource);assert.equal(uploads.length,0);
 reset();missing();changed=true;await assert.rejects(service.repairNextApprovedSource);assert.equal(uploads.length,0);
 reset();missing();objects.delete(manifest[0].storageKey);await assert.rejects(service.repairNextApprovedSource);assert.equal(uploads.length,0);
 reset();missing();uploadMode='uncertain';const uncertain=await service.repairNextApprovedSource();assert(uncertain.results.every(r=>r.outcome==='present-after-upload-error'));assert.equal(uploads.length,2);
 reset();missing();uploadMode='fail-second';await assert.rejects(service.repairNextApprovedSource);assert(objects.has(pipeline.renditionStorageKey(manifest[0].storageKey,'catalog')));uploadMode='ok';const resumed=await service.repairNextApprovedSource();assert.equal(resumed.results[0].outcome,'skipped-existing');assert.equal(uploads.length,3);
 reset();missing();now=Date.parse('2026-10-25T19:00:00Z');await assert.rejects(service.repairNextApprovedSource);assert.equal(uploads.length,0);
 reset();missing();now=Date.parse('2026-10-20T18:59:59Z');await assert.rejects(service.repairNextApprovedSource);assert.equal(uploads.length,0);
 let routeCalls=0;
 const route=load('app/api/owner-maintenance/photo-derivatives/route.ts',{'@/lib/catalog/approved-derivatives-repair':{repairStatus:async()=>[],repairNextApprovedSource:async()=>{routeCalls++;return{done:true}}},'@/lib/assistant/chat/limits':{AssistantError:class extends Error{}}});
 const origin='https://mariposa-crm-git-review-website-current-20261009-mariposa-crm.vercel.app',url=origin+'/api/owner-maintenance/photo-derivatives';
 const request=(u=url,h={},body)=>new Request(u,{method:'POST',headers:{origin,'sec-fetch-site':'same-origin',...h},body});
 assert.equal((await route.POST(request())).status,200);
 for(const req of [request(url,{origin:'https://evil.example'}),request(url,{'sec-fetch-site':'cross-site'}),request(url+'?path=other'),request(url,{},'{}'),request(url.replace('mariposa-crm-git-review-website-current-20261009','other'))])assert((await route.POST(req)).status>=400);
 assert.equal(routeCalls,1);
 console.log('PASS: 62-source manifest; actual Sharp rendering/readback; no overwrite/original mutation; idempotence; denial/window/metadata/source failure; uncertain upload; partial resume; origin/query/body rejection. Synthetic only, zero network.');
})().catch(e=>{console.error(e);process.exitCode=1});
