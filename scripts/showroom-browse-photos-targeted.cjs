// Synthetic metadata only; exercise the existing publication predicate for each group.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const filename=path.join(__dirname,'showroom-photos-smoke.cjs');
const setup=fs.readFileSync(filename,'utf8').split('(async()=>')[0];
const test=`
(async()=>{
 let reads=0;
 db.productImage.findMany=async q=>{
   reads++;assert(q.where.OR.length<=50);assert.deepEqual(q.distinct,['productId','executionId']);
   for(const clause of q.where.OR)guard({where:clause});
   return allowed?[{id:imageId,productId,executionId,width:800,height:1200}]:[];
 };
 const {withPublicPhotos}=require('../lib/showroom/photos.ts');
 const input={productId,executionId,name:'Synthetic'};
 const rows=await withPublicPhotos(org,[input]);assert.equal(reads,1);assert.equal(rows[0].images.length,1);assert.equal(rows[0].images[0].id,imageId);assert.equal(storageCalls,0);
 assert(!JSON.stringify(rows).includes('storageKey'));assert(!JSON.stringify(rows).includes('organizations/'));
 allowed=false;assert.equal((await withPublicPhotos(org,[input]))[0].images.length,0,'unpublished metadata never reused');
 const before=reads;await withPublicPhotos(org,[]);assert.equal(reads,before);
 await withPublicPhotos(org,Array.from({length:51},()=>input));assert.equal(reads,before+2,'bounded batches');
 console.log('PASS: batched browse photo metadata; same org/product/execution/publication guards; one thumbnail; no cached unpublished photos; no Storage or live calls');
})().catch(e=>{console.error(e);process.exitCode=1});`;
const m=new Module(filename,module);m.filename=filename;m.paths=module.paths;m._compile(setup+test,filename);
