// Fixed synthetic clock keeps the existing rental fixtures in the future.
const RealDate = Date;
global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ["2026-10-01T00:00:00Z"])); } static now() { return RealDate.parse("2026-10-01T00:00:00Z"); } };
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const load=Module._load,resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};Module._load=function(id,...args){if(id==='server-only')return {};return load.call(this,id,...args)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017,esModuleInterop:true}}).outputText,f);
global.fetch=()=>{throw Error('NO LIVE NETWORK')};
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const branch=id(1),dress=id(2),shoes=id(3),accessory=id(4),alternate=id(5);
const categories=[{id:id(12),name:'Платья > Платья'},{id:id(13),name:'Обувь > Туфли'},{id:id(14),name:'Аксессуары > Для головы и волос'}];
const records=new Map([[dress,{slot:'dress',categoryId:id(12),name:'Тестовое платье',size:'140'}],[shoes,{slot:'shoes',categoryId:id(13),name:'Тестовые туфли',size:'35'}],[accessory,{slot:'accessory',categoryId:id(14),name:'Тестовый ободок',size:'Без размера'}],[alternate,{slot:'accessory',categoryId:id(14),name:'Другой тестовый ободок',size:'Без размера'}]]);
let searches=[],checks=[],empty=false;
function card(variantId,input){const row=records.get(variantId);assert.ok(row,'unknown variant rejected');return {productId:id(100+Number(variantId.slice(0,8))),executionId:null,categoryId:row.categoryId,item:{id:variantId,name:row.name,size:row.size,execution:'Белый',price:null,available:true},branchId:input.branchId,from:input.from,until:input.until}}
function tools(){return {branches:[{id:branch,name:'Астана',city:'Астана',timezone:'Asia/Almaty'}],categories,cards:new Map(),searched:false,select:async function(input){assert.equal(input.branchId,branch);checks.push(input);return card(input.variantId,input)},execute:async function(name,input){assert.equal(name,'find_dresses');assert.ok(categories.some(c=>c.id===input.categoryId));searches.push(input);this.cards.clear();this.searched=true;if(!empty){const ids=[...records].filter(([,r])=>r.categoryId===input.categoryId).map(([key])=>key);for(const key of ids)this.cards.set(key,card(key,input));}return {products:[]}}}}
const noProvider={create:async()=>{throw Error('Known criteria must not call provider')}};
const first='желтое платье, 140 размер. На 02.10.2026 заберу в 12 дня и принесу 04.10.2026 в 18.00';
const signal=()=>new AbortController().signal;
(async()=>{
const {runOutfitConversation}=require('../lib/assistant/chat/outfit.ts');
let result=await runOutfitConversation({syntheticOnly:true,branchId:branch,messages:[{role:'user',content:first}]},noProvider,tools(),signal());
assert.equal(searches.length,1);assert.equal(searches[0].size,'140');assert.equal(searches[0].categoryId,id(12));assert.equal(result.cards[0].item.id,dress);assert.equal(result.context.from,'2026-10-02T12:00');
const legacyShoe=await runOutfitConversation({syntheticOnly:true,branchId:branch,messages:[{role:'user',content:first},{role:'assistant',content:'Вот варианты.'},{role:'user',content:'Теперь туфли'}]},noProvider,tools(),signal());assert.equal(legacyShoe.context.criteria.shoes.size,null);assert.match(legacyShoe.message,/размер обуви/);assert.equal(searches.length,1);
async function turn(text,action){result=await runOutfitConversation({syntheticOnly:true,branchId:branch,context:result.context,action,messages:[{role:'user',content:text}]},noProvider,tools(),signal());return result;}
await turn('Выбираю платье',{type:'select',slot:'dress',variantId:dress});assert.equal(result.outfit.dress.item.id,dress);assert.ok(result.choices.some(c=>c.slot==='shoes'));assert.ok(result.choices.some(c=>c.slot==='accessory'));
const before=searches.length;await turn('Подбери туфли к платью');assert.match(result.message,/размер обуви/);assert.equal(searches.length,before);assert.equal(result.context.criteria.shoes.size,null);assert.equal(result.context.criteria.dress.size,'140');assert.equal(result.outfit.dress.item.id,dress);
await turn('35');assert.equal(searches.at(-1).size,'35');assert.equal(searches.at(-1).categoryId,id(13));assert.equal(searches.at(-1).from,'2026-10-02T12:00');assert.equal(result.cards[0].item.id,shoes);assert.match(result.message,/совместимость.*не подтверждена/);
await turn('Выбираю туфли',{type:'select',slot:'shoes',variantId:shoes});assert.equal(result.outfit.dress.item.id,dress);assert.equal(result.outfit.shoes.item.id,shoes);
await turn('Подбери аксессуар',{type:'search',slot:'accessory',categoryId:id(14)});assert.equal(searches.at(-1).size,'');assert.equal(searches.at(-1).categoryId,id(14));assert.equal(result.cards[0].item.id,accessory);
await turn('Выбираю ободок',{type:'select',slot:'accessory',variantId:accessory});assert.equal(Object.keys(result.outfit).length,3);
await turn('Замени аксессуар');assert.equal(result.outfit.dress.item.id,dress);assert.equal(result.outfit.shoes.item.id,shoes);assert.equal(result.outfit.accessory.item.id,accessory);assert.equal(result.cards.length,1);assert.equal(result.cards[0].item.id,alternate);
await turn('Нет');assert.equal(Object.keys(result.outfit).length,3);assert.equal(result.cards.length,0);assert.match(result.message,/ничего не добавляю/);
await turn('Без обуви');assert.equal(result.context.selected.shoes,null);assert.equal(result.outfit.dress.item.id,dress);assert.equal(result.outfit.accessory.item.id,accessory);
await turn('Перейти к заявке',{type:'finish'});assert.equal(Object.keys(result.outfit).length,2);assert.match(result.message,/не отправлен, заявка в CRM не создана/);assert.equal(result.context.criteria.dress.size,'140');assert.equal(result.context.criteria.shoes.size,'35');
await assert.rejects(turn('Выбираю',{type:'select',slot:'shoes',variantId:accessory}));
await assert.rejects(runOutfitConversation({syntheticOnly:true,branchId:id(999),context:result.context,messages:[{role:'user',content:'Да'}]},noProvider,tools(),signal()));
empty=true;const exact=[first,'В каком филиале вы хотели бы взять платье: в Астане?','Астана','Подскажите точный размер: 140?','Да','Уточните даты в формате ГГГГ-ММ-ДД ЧЧ:ММ?','Получение 2026.10.02 12:00, возврат 2026.10.04 18:00','Подтвердите жёлтый и 140?','да'];
result=await runOutfitConversation({syntheticOnly:true,branchId:branch,messages:exact.map((content,i)=>({role:i%2?'assistant':'user',content}))},noProvider,tools(),signal());assert.match(result.message,/вариантов не найдено/);assert.equal(searches.at(-1).size,'140');assert.equal(searches.at(-1).color,'Жёлтый');assert.equal(result.cards.length,0);
const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const calendar={...emptyOutfit(),from:'2026-10-03T12:00',until:'2026-10-05T18:00',calendarPeriod:true};
const periodTurn=(ctx,action={type:'period'},content='Период выбран в календаре')=>runOutfitConversation({syntheticOnly:true,branchId:branch,context:ctx,action,messages:[{role:'user',content}]},noProvider,tools(),signal());
let dated=await periodTurn(calendar);assert.match(dated.message,/Какое платье и размер/);assert.equal(dated.context.from,calendar.from);
dated=await periodTurn(calendar,undefined,'Жёлтое платье, размер 140');
// Explicit message (no period action): calendar fields are known without a model call.
dated=await runOutfitConversation({syntheticOnly:true,branchId:branch,context:calendar,messages:[{role:'user',content:'Жёлтое платье, размер 140'}]},noProvider,tools(),signal());assert.equal(searches.at(-1).from,calendar.from);assert.equal(searches.at(-1).until,calendar.until);
const picked={...dated.context,selected:{dress,shoes:null,accessory:null},from:'2026-10-06T12:00',until:'2026-10-08T18:00'};
const restoreCount=checks.length; const restored=await periodTurn(picked,{type:'restore'}); assert.equal(checks.length,restoreCount+1); assert.equal(restored.outfit.dress.item.id,dress); await assert.rejects(periodTurn({...picked,selected:{dress:id(999),shoes:null,accessory:null}},{type:'restore'}));
const count=checks.length;dated=await periodTurn(picked);assert.equal(checks.length,count+1);assert.equal(dated.outfit.dress.from,picked.from);assert.equal(dated.context.criteria.dress.size,'140');assert.equal(dated.cards.length,0);
await assert.rejects(periodTurn({...calendar,until:calendar.from}));await assert.rejects(periodTurn({...calendar,from:'2026-02-30T12:00'}));await assert.rejects(periodTurn({...calendar,until:'2026-10-02T12:00'}));await assert.rejects(periodTurn({...calendar,from:null}));
await assert.rejects(periodTurn({...calendar,criteria:{...calendar.criteria,shoes:{size:'35',color:'',categoryId:id(12)}}}));
await assert.rejects(periodTurn(calendar,{type:'select',slot:'shoes',variantId:dress}));
await assert.rejects(periodTurn(calendar,{type:'select',slot:'dress',variantId:id(999)}));
const realNow=Date.now;try {
 Date.now=()=>Date.parse('2026-10-03T08:00:00Z');
 await assert.rejects(periodTurn(calendar)); // 12:00 Asia/Almaty is 07:00Z, already past.
 const utcTools=tools();utcTools.branches[0].timezone='UTC';
 await runOutfitConversation({syntheticOnly:true,branchId:branch,context:calendar,action:{type:'period'},messages:[{role:'user',content:'Период выбран'}]},noProvider,utcTools,signal());
} finally { Date.now=realNow; }
console.log('PASS: structured calendar period, invalid/reversed dates rejected, no repeated date question/provider call, changed dates recheck selected items and retain criteria.');
console.log('PASS: exact original transcript; dress → explicit selection → shoes with independent size → accessory; shared branch/dates; replace one item; refusal/removal keeps others; live selections revalidated; no fabricated compatibility; no inquiry/order/payment writes or live provider calls.');
})().catch(error=>{console.error(error);process.exitCode=1});
