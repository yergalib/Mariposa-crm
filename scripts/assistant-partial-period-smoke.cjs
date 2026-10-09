// Incremental period regression. Synthetic DTOs/provider only; network and DB forbidden.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const load=Module._load,resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};Module._load=function(id,...args){if(id==='server-only')return {};return load.call(this,id,...args)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
global.fetch=()=>{throw Error('NETWORK FORBIDDEN')};Date.now=()=>Date.parse('2026-10-01T00:00:00Z');
const id=n=>String(n).padStart(8,'0')+'-1111-4111-8111-111111111111';const branch=id(1),category=id(2),variant=id(3),product=id(4);
const {runOutfitConversation}=require('../lib/assistant/chat/outfit.ts');const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const searches=[],checks=[];let extractions=0;
const provider={create:async()=>{extractions++;return {status:'completed',output:[],outputText:JSON.stringify({sizeQuote:null,colorQuote:null,fromQuote:null,untilQuote:null}),outputTokens:1}}};
const card=input=>({productId:product,executionId:null,categoryId:category,item:{id:variant,name:'Synthetic public dress',size:'140',execution:null,price:{amountMinor:'18000',currency:'KZT'},available:true},branchId:input.branchId,from:input.from,until:input.until});
const tools={branches:[{id:branch,name:'Synthetic',city:'Synthetic',timezone:'Asia/Almaty'}],categories:[{id:category,name:'Платья'}],cards:new Map(),searched:false,select:async input=>{assert.equal(input.variantId,variant);assert.equal(input.branchId,branch);checks.push(input);return card(input)},execute:async(name,input)=>{assert.equal(name,'find_dresses');assert.ok(input.from&&input.until);assert.ok(input.until>input.from);searches.push(input);tools.cards.clear();tools.cards.set(variant,card(input));tools.searched=true;return {products:[card(input)]}}};
const raw=(text,context,extra={})=>({syntheticOnly:true,branchId:branch,context,messages:[{role:'user',content:text}],...extra});
const run=input=>runOutfitConversation(input,provider,tools,new AbortController().signal);
(async()=>{
let result=await run(raw('Заберу 02.10.2026 в 12:00, рост 138 см'));
assert.equal(result.context.from,'2026-10-02T12:00');assert.equal(result.context.until,null);assert.equal(result.context.heightCm,138);assert.equal(result.context.criteria.dress.size,null);assert.match(result.message,/размер/);assert.equal(searches.length,0);const {conversationState,emptyConversation}=require('../lib/assistant/chat/storage.ts');const restored=conversationState.parse(JSON.parse(JSON.stringify({...emptyConversation,branchId:branch,context:result.context})));assert.equal(restored.context.from,result.context.from);assert.equal(restored.context.heightCm,138);
result=await run(raw('размер 140',result.context));assert.match(result.message,/цвет/);assert.equal(result.context.heightCm,138);assert.equal(result.context.from,'2026-10-02T12:00');assert.equal(searches.length,0);
result=await run(raw('Розовый',result.context));assert.match(result.message,/Когда верн/);assert.doesNotMatch(result.message,/Когда забер/);assert.equal(searches.length,0);
result=await run(raw('Лучше белый',result.context));assert.equal(result.context.criteria.dress.color,'Белый');assert.equal(result.context.criteria.dress.size,'140');assert.equal(result.context.heightCm,138);assert.match(result.message,/Когда верн/);assert.equal(searches.length,0);
// A short unlabelled answer fills the missing return, never overwrites pickup.
result=await run(raw('04.10.2026 в 18:00',result.context));assert.equal(result.context.from,'2026-10-02T12:00');assert.equal(result.context.until,'2026-10-04T18:00');assert.equal(searches.length,1);assert.equal(searches[0].color,'Белый');assert.equal(searches[0].size,'140');assert.equal(result.cards[0].item.id,variant);assert.deepEqual(result.cards[0].item.price,{amountMinor:'18000',currency:'KZT'});assert.equal(result.cards[0].item.available,true);
const beforeProvider=extractions;result=await run(raw('Выбираю',result.context,{action:{type:'select',slot:'dress',variantId:variant}}));assert.equal(extractions,beforeProvider);assert.equal(result.outfit.dress.item.id,variant);assert.equal(checks.at(-1).from,'2026-10-02T12:00');assert.equal(result.context.heightCm,138);
const complete=result.context,count=searches.length,checkCount=checks.length;
await assert.rejects(run(raw('Возврат 01.10.2026 в 12:00',complete)));assert.equal(searches.length,count);assert.equal(checks.length,checkCount,'invalid newly merged period cannot reach availability');assert.equal(complete.until,'2026-10-04T18:00','caller context not mutated');
await assert.rejects(run(raw('Период',{...emptyOutfit(),from:'2026-10-02T12:00'},{action:{type:'period'}})));
await assert.rejects(run(raw('Да',{...emptyOutfit(),from:'2026-02-30T12:00'})));
await assert.rejects(run(raw('Да',{...emptyOutfit(),from:'2026-09-01T12:00'})));
await assert.rejects(run(raw('Да',undefined,{branchId:id(999)})));
let reverse=await run(raw('Верну 05.10.2026 в 18:00, размер 140, белый'));assert.equal(reverse.context.from,null);assert.equal(reverse.context.until,'2026-10-05T18:00');assert.match(reverse.message,/Когда забер/);
reverse=await run(raw('03.10.2026 в 12:00',reverse.context));assert.equal(reverse.context.from,'2026-10-03T12:00');assert.equal(reverse.context.until,'2026-10-05T18:00');
const twoBranches={...tools,branches:[...tools.branches,{id:id(9),name:'Other',city:'Other',timezone:'UTC'}]};const unscoped=raw('Заберу 03.10.2026 в 12:00, рост 138 см, размер 140, белый');delete unscoped.branchId;
const pending=await runOutfitConversation(unscoped,provider,twoBranches,new AbortController().signal);assert.equal(pending.context.from,'2026-10-03T12:00');assert.match(pending.message,/Выберите филиал/);
console.log('PASS: incremental pickup/return in either order; height is not size; colour clarification preserves dates/size/height; only missing endpoint asked; no availability before complete period; exact synthetic CRM card ID/price/availability and selection recheck; invalid merged dates rejected before reads; strict calendar action and branch validation; zero live network/model/DB writes.');
})().catch(e=>{console.error(e);process.exitCode=1});
