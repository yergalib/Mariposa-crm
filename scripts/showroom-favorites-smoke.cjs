const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const load=Module._load,resolve=Module._resolveFilename;let calls=[];
class ShowroomError extends Error{constructor(message,status){super(message);this.status=status}}
const service={ShowroomError,publicProduct:async input=>{calls.push(input);if(input.productId===id(2))throw new ShowroomError('unpublished',404);if(input.productId===id(3))throw new Error('private diagnostic');return {name:'Synthetic',...input,options:[]}}};
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
Module._load=function(id,...args){if(id==='server-only')return {};if(id==='./service'&&args[0].filename.endsWith('favorite-resolution.ts'))return service;return load.call(this,id,...args)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);
function id(n){return `${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`}
const {readFavorites,encodeFavorites,parseFavoriteQuery,favoriteKey}=require('../lib/showroom/favorites.ts');
const refs=[1,2,3].map(n=>({productId:id(n),executionId:null}));const now=Date.now();
assert.deepEqual(readFavorites(encodeFavorites(refs,now),now),refs);assert.deepEqual(readFavorites(encodeFavorites(refs,now),now+31*86400000),[]);
assert.deepEqual(readFavorites('not json'),[]);assert.deepEqual(readFavorites(JSON.stringify({version:1,expiresAt:now+10000,items:[{...refs[0],phone:'private'}]})),[]);
assert.deepEqual(parseFavoriteQuery('tenant.anything'),[]);assert.deepEqual(parseFavoriteQuery(Array(13).fill(favoriteKey(refs[0])).join(',')),[]);
assert.equal(parseFavoriteQuery([refs[0],refs[0]].map(favoriteKey).join(',')).length,1);
assert.ok(!encodeFavorites(refs).includes('Synthetic'));assert.equal(JSON.stringify(refs).includes('price'),false);
(async()=>{const {resolveFavoriteProducts}=require('../lib/showroom/favorite-resolution.ts');const rows=await resolveFavoriteProducts(refs.map(favoriteKey).join(','));assert.equal(calls.length,3);assert.deepEqual(calls[0],{productId:id(1),executionId:''});assert.equal(rows[0].product.name,'Synthetic');assert.equal(rows[1].product,null);assert.equal(rows[1].unavailable,true);assert.equal(rows[2].unavailable,false);assert.ok(!JSON.stringify(rows).includes('private diagnostic'));await resolveFavoriteProducts('bad');assert.equal(calls.length,3);console.log('PASS: bounded ID-only favorites; TTL/schema/duplicate/malformed checks; publication revalidation; unavailable vs transient error; no diagnostic leakage. Mock service only.');})().catch(error=>{console.error(error);process.exitCode=1});
