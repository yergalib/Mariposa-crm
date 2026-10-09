// Real typed runner/outfit engine with synthetic service adapter. No model/DB/network.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,org=id(1),branch=id(2),category=id(3);
process.env.STOREFRONT_ORGANIZATION_ID=org;
let queries=[],reads=0,failed=false,unpublished=false;
class ShowroomError extends Error{}
const branches=[{id:branch,name:'Synthetic',city:'Synthetic',timezone:'Asia/Almaty'}];
const groups=Array.from({length:8},(_,i)=>({id:id(20+i)+':default',productId:id(20+i),executionId:null,name:'Dress '+i,color:'Розовый',execution:null,variants:[{id:id(40+i),name:'Dress '+i,size:'140',execution:null,price:i===0?null:{amountMinor:'10000',currency:'KZT'},available:i!==0}]}));
const product=async input=>{reads++;if(unpublished||!groups.some(g=>g.productId===input.productId))throw new ShowroomError('Товар недоступен');const g=groups.find(g=>g.productId===input.productId);return {...g,variants:undefined,sizes:['140'],options:[{id:g.variants[0].id,size:'140'}],images:[{id:id(60),src:'/api/showroom/photo?fixture=1',alt:'CRM photo',width:800,height:1200}]};};
const service={ShowroomError,publicBranches:async()=>branches,publicCategories:async()=>[{id:category,name:'Платья'}],publicProduct:product,
 publicCatalog:async input=>{queries.push(input);if(failed)throw new ShowroomError('Наличие временно недоступно');return {items:groups,page:input.page,more:input.page===1,appliedColor:input.color};},
 publicSelection:async input=>{if(failed)throw new ShowroomError('Наличие временно недоступно');const g=groups.find(g=>g.variants[0].id===input.variantId);if(!g)throw new ShowroomError('Товар недоступен');return g.variants[0];},
 publicSelectedCard:async input=>{const item=await service.publicSelection(input);const g=groups.find(g=>g.variants[0].id===item.id);return {productId:g.productId,executionId:null,categoryId:category,item,...input};}};
const load=Module._load,resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args);};
Module._load=function(id,...args){if(id==='server-only')return {};if(id==='@/lib/showroom/service')return service;return load.call(this,id,...args);};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
global.fetch=()=>{throw Error('NETWORK FORBIDDEN');};
const session={organizationId:org,allowedBranchIds:[branch],hasOrganizationWideBranchAccess:false};
const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10),from=day+'T12:00',until=day+'T18:00';
const criteria={branchId:branch,size:'140',color:'Розовый',from,until,search:'',categoryId:category};
const provider={create:async()=>{throw Error('PAID MODEL FORBIDDEN');}};
(async()=>{const {createCrmTools}=require('../lib/assistant/chat/tools.ts');const {runOutfitConversation}=require('../lib/assistant/chat/outfit.ts');const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
 await assert.rejects(()=>createCrmTools({...session,organizationId:id(999)}));assert.equal(reads,0);
 const restricted=await createCrmTools({...session,allowedBranchIds:[]});await assert.rejects(()=>restricted.product({productId:groups[0].productId}));
 const tools=await createCrmTools(session);await assert.rejects(()=>tools.execute('find_dresses',{...criteria,branchId:id(999)}));assert.equal(queries.length,0);
 let result=await tools.execute('find_dresses',criteria);assert.equal(result.products.length,3);assert.deepEqual(result.next,{page:1,offset:3});assert.equal(result.products[0].item.available,true);assert.equal(result.products[0].images[0].alt,'CRM photo');assert.ok(result.products[0].reasons.some(r=>r.includes('Розовый')));
 const firstIds=result.products.map(c=>c.item.id);result=await tools.execute('find_dresses',{...criteria,...result.next});assert.equal(result.products.length,3);assert.ok(result.products.every(c=>!firstIds.includes(c.item.id)));assert.deepEqual(result.next,{page:1,offset:6});
 result=await tools.execute('find_dresses',{...criteria,...result.next});assert.equal(result.products.length,2);assert.deepEqual(result.next,{page:2,offset:0});assert.equal(result.products.at(-1).item.available,false);assert.equal(result.products.at(-1).item.price,null);
 const c=result.products[0];assert.deepEqual((await tools.execute('get_price',{branchId:branch,variantId:c.item.id,from,until})).price,c.item.price);
 failed=true;result=await tools.execute('find_dresses',criteria);assert.match(result.error,/Наличие/);assert.equal(tools.cards.size,0);assert.equal(tools.searched,false);failed=false;
 assert.ok((await tools.execute('find_dresses',{...criteria,organizationId:id(999)})).error);assert.equal(tools.cards.size,0);
 unpublished=true;assert.ok((await tools.execute('find_dresses',criteria)).error);assert.equal(tools.cards.size,0);unpublished=false;
 let context=emptyOutfit();Object.assign(context,{from,until,calendarPeriod:true});context.criteria.dress={size:'140',color:'Розовый',categoryId:category};
 const turn=(text,extra={})=>runOutfitConversation({syntheticOnly:true,branchId:branch,context,messages:[{role:'user',content:text}],...extra},provider,tools,new AbortController().signal);
 let reply=await turn('Покажи платья, рост 138 см');context=reply.context;assert.equal(context.heightCm,138);assert.equal(context.criteria.dress.size,'140');assert.equal(context.nextSearch.offset,3);
 reply=await turn('Ещё варианты',{action:{type:'more',slot:'dress'}});context=reply.context;assert.equal(queries.at(-1).page,1);assert.equal(queries.at(-1).color,'Розовый');assert.equal(queries.at(-1).size,'140');assert.equal(queries.at(-1).from,from);assert.equal(reply.cards.length,3);
 reply=await turn('Выбираю',{action:{type:'select',slot:'dress',variantId:id(41)}});context=reply.context;assert.equal(reply.outfit.dress.images.length,1);
 reply=await turn('Проверить избранное',{action:{type:'compare'},products:[{productId:id(20),executionId:null}]});assert.equal(reply.comparisons[0].name,'Dress 0');assert.match(reply.message,/рост не гарантирует/);
 await assert.rejects(()=>turn('Проверить',{action:{type:'compare'},products:[{productId:id(999),executionId:null}]}));
 reply=await turn('Какие правила аренды?');assert.match(reply.message,/подтверждает сотрудник/);
 failed=true;await assert.rejects(()=>turn('Перепроверить',{action:{type:'restore'}}));failed=false;
 // Missing size is not replaced by height; provider is test-only and returns no evidence.
 const blank=emptyOutfit();Object.assign(blank,{from,until});blank.criteria.dress.categoryId=category;blank.criteria.dress.color='Розовый';
 const testProvider={create:async()=>({status:'completed',output:[],outputText:JSON.stringify({sizeQuote:null,colorQuote:null,fromQuote:null,untilQuote:null}),outputTokens:10})};
 reply=await runOutfitConversation({syntheticOnly:true,branchId:branch,context:blank,messages:[{role:'user',content:'рост 138 см'}]},testProvider,tools,new AbortController().signal);assert.match(reply.message,/размер/);assert.equal(reply.cards.length,0);
 reply=await runOutfitConversation({syntheticOnly:true,branchId:branch,context,messages:[{role:'user',content:'Не розовый'}]},testProvider,tools,new AbortController().signal);assert.match(reply.message,/Какой цвет/);assert.equal(reply.cards.length,0);
 const {replayCriteria}=require('../lib/assistant/chat/criteria.ts');const corrected=replayCriteria([{role:'user',content:'розовый, размер 140'},{role:'assistant',content:'Варианты'},{role:'user',content:'теперь бордо'}],branches,branch);assert.equal(corrected.color,null);assert.equal(corrected.size,'140');
 console.log('PASS: tenant/branch/publication failures; typed cards/photo/price/Core availability adapter; bounded 3+3+2 pagination; factual ranking; dates/size/colour follow-up; height not size; favourites revalidation; rental rules; no stale availability on failure; no network/provider/DB writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
