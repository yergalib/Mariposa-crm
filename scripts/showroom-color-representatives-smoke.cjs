// Real service + photo query code, synthetic DB adapter; no database connection.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const tenant='11111111-1111-4111-8111-111111111111', category='22222222-2222-4222-8222-222222222222';
process.env.STOREFRONT_ORGANIZATION_ID=tenant;process.env.VERCEL_ENV='preview';
let overLimit=false,publicBranch=true,photoQueries=0;
const groups=Array.from({length:15},(_,i)=>({productId:`${String(i+1).padStart(8,'0')}-1111-4111-8111-111111111111`,executionId:null}));
const products=groups.map((g,i)=>({id:g.productId,name:'Synthetic '+i,color:i===13?'Молочный':i===14?'unknown':'Розовый',executions:[]}));
function policy(where){const s=JSON.stringify(where);for(const token of [tenant,'showOnWebsite','publicationStatus','isRentable','isActive'])assert.ok(s.includes(token),token);}
const db={branch:{findFirst:async({where})=>{assert.equal(where.organizationId,tenant);assert.equal(where.isPublic,true);return publicBranch?{id:tenant}:null;}},
 category:{findMany:async({where})=>{policy(where);return [{id:category,name:'Платья'}];}},
 productVariant:{groupBy:async({where,take,skip})=>{policy(where);assert.equal(take,2001);assert.equal(skip,undefined);return overLimit?Array(2001).fill(groups[0]):groups;}},
 product:{findMany:async({where,select})=>{policy(where);assert.equal(select.color,true);return products;}},
 productImage:{findMany:async({where,distinct,select})=>{photoQueries++;assert.deepEqual(distinct,['productId','executionId']);assert.equal(select.storageKey,undefined);for(const clause of where.OR){policy(clause);assert.equal(clause.deletedAt,null);assert.equal(clause.productVariantId,null);assert.equal(clause.executionId,null);}return [12,13,14].map(i=>({id:'image'+i,productId:groups[i].productId,executionId:null,width:800,height:1200}));}}
};
const load=Module._load,resolve=Module._resolveFilename;
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
Module._load=function(id,...args){if(id==='server-only')return {};if(id==='@/lib/db')return {db};if(id==='@/lib/tenant/context')return {createTenantContext:organizationId=>({organizationId})};if(['@/lib/inquiries/record','@/lib/availability/capacity','@/lib/storage/client','@/generated/prisma/client'].includes(id))return {};return load.call(this,id,...args);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);
(async()=>{const {publicColorPhotoCards,publicHomePhotoCards}=require('../lib/showroom/service.ts');
 const cards=await publicColorPhotoCards(category);assert.deepEqual(cards.map(c=>c.id),['pink','other']);assert.equal(cards[0].photo.id,'image12');assert.equal(cards[1].photo.id,'image13');assert.equal(photoQueries,1);
 const photographed=await publicHomePhotoCards(category);assert.equal(photographed.length,3);assert.equal(photographed[2].color,'unknown');assert(photographed.every(p=>p.images.length===1));
 assert.deepEqual(await publicColorPhotoCards('missing-category'),[]);
 publicBranch=false;assert.deepEqual(await publicColorPhotoCards(category),[]);publicBranch=true;
 overLimit=true;await assert.rejects(()=>publicColorPhotoCards(category),/Подбор цветов/);
 console.log('PASS: real representative service scans beyond first 12; batches protected photo metadata; tenant/publication/category gates; known Other colour; no branch/invalid category closed; 2000-group bound fails closed. Synthetic DB only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
