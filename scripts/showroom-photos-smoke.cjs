const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,org=id(1),productId=id(2),executionId=id(3),imageId=id(4);
let allowed=true,publicBranch=true,storageCalls=0,key=`organizations/${org}/products/${productId}/source.png`,missing=false;
const source=new Blob([Buffer.from('RIFF0000WEBPsynthetic')],{type:'image/webp'});
const db={branch:{findFirst:async q=>{assert.equal(q.where.organizationId,org);assert.equal(q.where.isPublic,true);return publicBranch?{id:id(5)}:null}},productImage:{
 findMany:async q=>{guard(q);assert.equal(q.take,8);assert.deepEqual(Object.keys(q.select).sort(),['height','id','width']);return allowed?[{id:imageId,width:800,height:1200}]:[]},
 findFirst:async q=>{guard(q);return allowed&&q.where.id===imageId?{storageKey:key}:null}
}};
function guard(q){assert.equal(q.where.organizationId,org);assert.equal(q.where.productId,productId);assert.equal(q.where.executionId,executionId);assert.equal(q.where.productVariantId,null);assert.equal(q.where.status,'ACTIVE');assert.equal(q.where.deletedAt,null);const p=q.where.product.variants.some.AND[0];assert.equal(p.product.showOnWebsite,true);assert.ok(JSON.stringify(p).includes('showOnWebsiteOverride'));}
const load=Module._load,resolve=Module._resolveFilename;
Module._resolveFilename=function(n,...a){return resolve.call(this,n.startsWith('@/')?path.resolve(n.slice(2)):n,...a)};
Module._load=function(n,...a){if(n==='server-only')return{};if(n==='@/lib/db')return{db};if(n==='@/lib/storage/client')return{PRODUCT_IMAGES_BUCKET:'product-images',getStorageClient:()=>({storage:{from:bucket=>{assert.equal(bucket,'product-images');return{download:async k=>{storageCalls++;assert.equal(k,key+'.site.webp');return{data:missing?null:source,error:null}}}}}})};return load.call(this,n,...a)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);
(async()=>{const{publicPhotos,readPublicPhoto}=require('../lib/showroom/photos.ts');const input={productId,executionId,imageId};const rows=await publicPhotos(org,{productId,executionId,name:'Synthetic'});assert.equal(rows.length,1);assert(rows[0].src.startsWith('/api/showroom/photo?'));assert(!JSON.stringify(rows).includes('storageKey'));assert(!JSON.stringify(rows).includes('organizations/'));assert.equal(await readPublicPhoto(org,input),source);assert.equal(storageCalls,1);
allowed=false;assert.deepEqual(await publicPhotos(org,{productId,executionId,name:'Synthetic'}),[]);assert.equal(await readPublicPhoto(org,input),null);assert.equal(storageCalls,1);
allowed=true;publicBranch=false;assert.equal(await readPublicPhoto(org,input),null);assert.equal(storageCalls,1);publicBranch=true;
assert.equal(await readPublicPhoto(org,{...input,imageId:id(99)}),null);key=`organizations/${id(99)}/products/${productId}/private.png`;assert.equal(await readPublicPhoto(org,input),null);assert.equal(storageCalls,1);
key=`organizations/${org}/products/${productId}/source.png`;missing=true;assert.equal(await readPublicPhoto(org,input),null);assert.equal(storageCalls,2,'missing rendition never falls back to original');await assert.rejects(readPublicPhoto(org,{...input,imageId:'../../secret'}));
console.log('PASS: bounded public image DTO; exact tenant/product/execution + publication gates; no private URLs/keys; branch closure and wrong image rejected before Storage; derived image only, no original fallback. Synthetic only.');})().catch(e=>{console.error(e);process.exitCode=1});
