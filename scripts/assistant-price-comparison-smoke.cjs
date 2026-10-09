// Synthetic contract tests only; no credentials, network, model or database.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const load=Module._load,resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};Module._load=function(id,...args){if(id==='server-only')return {};return load.call(this,id,...args)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
global.fetch=()=>{throw Error('NETWORK FORBIDDEN')};Date.now=()=>Date.parse('2026-10-01T00:00:00Z');
const {runOutfitConversation}=require('../lib/assistant/chat/outfit.ts'),{emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const id=n=>String(n).padStart(8,'0')+'-1111-4111-8111-111111111111',branch=id(1),category=id(2),selected=id(3),shoe=id(4),shoeCategory=id(5);
const context={...emptyOutfit(),from:'2026-10-02T12:00',until:'2026-10-04T18:00',heightCm:138,selected:{dress:selected,shoes:shoe,accessory:null}};
context.criteria.dress={categoryId:category,size:'140',color:'Белый'};context.criteria.shoes={categoryId:shoeCategory,size:'35',color:''};
const price=(amount,currency='KZT')=>({amountMinor:amount,currency});
const make=(n,p,available=true)=>({productId:id(100+n),executionId:null,categoryId:category,item:{id:id(n),name:'Synthetic '+n,size:'140',execution:null,price:p,available},branchId:branch,from:context.from,until:context.until});
let reference=price('9007199254740993'),rows=[],searches=[],selects=[];
const provider={create:async()=>{throw Error('MODEL FORBIDDEN')}};
function tools(){return {branches:[{id:branch,name:'Synthetic',city:'Synthetic',timezone:'Asia/Almaty'}],categories:[{id:category,name:'Платья'},{id:shoeCategory,name:'Обувь'}],cards:new Map(),searched:false,select:async input=>{selects.push(input);assert.equal(input.branchId,branch);assert.ok([selected,shoe].includes(input.variantId),'unpublished/unknown variant rejected');return input.variantId===selected?make(3,reference):{...make(4,price('100')),categoryId:shoeCategory}},execute:async function(name,input){assert.equal(name,'find_dresses');searches.push(input);this.searched=true;this.cards=new Map(rows.map(card=>[card.item.id,card]));return {next:{page:1,offset:3}}}}}
const run=(text='Покажи платье дешевле',ctx=context)=>runOutfitConversation({syntheticOnly:true,branchId:branch,context:ctx,messages:[{role:'user',content:text}]},provider,tools(),new AbortController().signal);
(async()=>{
const saved=JSON.stringify(context);
rows=[make(10,price('9007199254740992')),make(11,price('10000')),make(12,price('1'),false),make(13,null),make(14,price('1','USD')),make(15,reference),make(16,price('9007199254740994')),make(3,price('1'))];
let result=await run();assert.deepEqual(result.cards.map(c=>c.item.id),[id(11),id(10)]);assert.match(result.message,/не поиск минимальной цены по всему каталогу/);assert.equal(result.context.nextSearch,undefined);assert.equal(result.context.heightCm,138);assert.deepEqual(result.context.selected,context.selected);assert.deepEqual(result.context.criteria,context.criteria);assert.equal(result.context.from,context.from);assert.equal(result.context.until,context.until);assert.equal(JSON.stringify(context),saved);assert.equal(result.outfit.shoes.item.id,shoe);assert.equal(selects.length,2);assert.equal(searches[0].color,'Белый');assert.equal(searches[0].size,'140');assert.equal(searches[0].categoryId,category);assert.equal(searches[0].from,context.from);assert.equal(searches[0].until,context.until);assert.equal(searches[0].branchId,branch);
rows=[make(10,reference),make(11,null),make(12,price('1'),false)];result=await run('Можно подешевле по цене?');assert.equal(result.cards.length,0);assert.match(result.message,/нет доступных вариантов/);
reference=null;let before=searches.length;result=await run();assert.match(result.message,/нет подтверждённой каталожной цены/);assert.equal(searches.length,before);
result=await run('Подешевле',{...context,selected:{dress:null,shoes:shoe,accessory:null}});assert.match(result.message,/Сначала выберите вещь/);assert.equal(searches.length,before);
reference=price('0');rows=[make(10,price('0'))];result=await run();assert.equal(result.cards.length,0);
reference=price('1');rows=[make(10,price('0'))];result=await run();assert.equal(result.cards[0].item.price.amountMinor,'0');
await assert.rejects(run('Подешевле',{...context,selected:{...context.selected,dress:id(999)}}),/unknown variant/);
console.log('PASS: exact CRM minor-unit comparison beyond Number precision; same currency; only available strictly cheaper alternatives; null/equal/zero/no-reference cases; selected reference revalidated; branch/dates/size/color/height/other slots preserved; bounded batch disclosure; no global minimum, currency conversion, automatic replacement, model/network/DB writes.');
})().catch(error=>{console.error(error);process.exitCode=1});
