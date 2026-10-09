// Exact regressions from independent review. All model and CRM results are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
Date.now=()=>Date.parse('2026-10-01T00:00:00Z');global.fetch=()=>{throw Error('NETWORK FORBIDDEN')};
const id=n=>String(n).padStart(8,'0')+'-1111-4111-8111-111111111111',org=id(1),branch=id(2),category=id(3);
process.env.STOREFRONT_ORGANIZATION_ID=org;
const groups=Array.from({length:8},(_,i)=>({id:id(100+i)+':default',productId:id(100+i),executionId:null,categoryId:category,name:'Synthetic '+i,color:'Белый',execution:null,variants:[{id:id(200+i),name:'Synthetic '+i,size:'140',execution:null,price:{amountMinor:String(10000+i*1000),currency:'KZT'},available:true}]}));
let queries=[],productReads=[],variantReads=[],unpublishedProduct=false,unpublishedVariant=false;
class ShowroomError extends Error{}
const service={ShowroomError,publicBranches:async()=>[{id:branch,name:'Synthetic',city:'Synthetic',timezone:'Asia/Almaty'}],publicCategories:async()=>[{id:category,name:'Платья'}],
 publicCatalog:async input=>{queries.push(input);return {items:input.page===1?groups.slice(0,4):[groups[2],groups[4],groups[5]],page:input.page,more:input.page===1,appliedColor:input.color}},
 publicProduct:async input=>{productReads.push(input);const g=groups.find(g=>g.productId===input.productId);if(!g||unpublishedProduct)throw new ShowroomError('Not public');return {...g,sizes:['140'],options:g.variants.map(v=>({id:v.id,size:v.size})),images:[]}},
 publicSelectedCard:async input=>{variantReads.push(input);const g=groups.find(g=>g.variants.some(v=>v.id===input.variantId));if(!g||unpublishedVariant)throw new ShowroomError('Not public');return {...input,categoryId:category,productId:g.productId,executionId:null,item:g.variants[0]}},publicSelection:async()=>{throw Error('unused')}};
const load=Module._load,resolve=Module._resolveFilename;Module._resolveFilename=function(k,...args){return resolve.call(this,k.startsWith('@/')?path.resolve(k.slice(2)):k,...args)};Module._load=function(k,...args){if(k==='server-only')return {};if(k==='@/lib/showroom/service')return service;return load.call(this,k,...args)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {runAssistantConversation,CONSULTATION_LIMITS}=require('../lib/assistant/chat/consultation.ts'),{emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts'),{createCrmTools}=require('../lib/assistant/chat/tools.ts'),{conversationState,emptyConversation}=require('../lib/assistant/chat/storage.ts');
const session={organizationId:org,allowedBranchIds:[branch],hasOrganizationWideBranchAccess:false};
const base=()=>{const c=emptyOutfit();c.from='2026-10-02T12:00';c.until='2026-10-04T18:00';c.criteria.dress={size:'140',color:'Белый',categoryId:category};return c};
const call=(name,args)=>({status:'completed',output:[{type:'function_call',name,arguments:JSON.stringify(args),call_id:'call_'+name}],outputText:'',outputTokens:100});
const answer=(cardIds=[],productRefs=[])=>({status:'completed',output:[],outputText:JSON.stringify({message:'Проверены данные каталога; окончательно подтвердит сотрудник.',cardIds,productRefs}),outputTokens:100});
const refs=groups.slice(0,4).map(g=>({productId:g.productId,executionId:null}));
const resultOf=b=>JSON.parse(b.input.filter(x=>x.type==='function_call_output').at(-1).output);
let calls=0;
async function run(context,steps,extra={}){
 let i=0;const result=await runAssistantConversation({syntheticOnly:true,branchId:branch,context,messages:[{role:'user',content:'Покажи варианты'}],...extra},{create:async b=>{calls++;assert.equal(b.parallel_tool_calls,false);assert.ok(!/\"(?:oneOf|const)\"/.test(JSON.stringify(b.tools)),'strict tool schemas use supported anyOf/enum');assert.ok(i<steps.length);const out=typeof steps[i]==='function'?await steps[i++](b):steps[i++];assert.ok(out.output.filter(x=>x.type==='function_call').length<=1,'realistic wire fixture');return out}},await createCrmTools(session),new AbortController().signal);assert.equal(i,steps.length);return result;
}
const more=c=>run(c,[],{action:{type:'more',slot:'dress'}});
(async()=>{
 // Cursor is returned, serializable, retained across a non-search clarification, and consumed by the button.
 let r=await run(base(),[call('find_dresses',{slot:'dress'}),answer([id(200),id(201),id(202)])]);const first=r.context;
 const picked=await run(first,[],{action:{type:'select',slot:'dress',variantId:id(200)}});assert.deepEqual(picked.context.nextSearch,first.nextSearch,'selection preserves unchanged cursor');
 const removed=await run(picked.context,[],{action:{type:'remove',slot:'dress'}});assert.deepEqual(removed.context.nextSearch,first.nextSearch,'removal preserves unchanged cursor');
 const changedPeriod=await run({...first,from:'2026-10-03T12:00'},[],{action:{type:'period'}});assert.equal(changedPeriod.context.nextSearch,undefined,'changed calendar period never restores old cursor');
 assert.deepEqual(first.nextSearch.seenVariantIds,[id(200),id(201),id(202)]);assert.equal(first.nextSearch.page,1);assert.equal(first.nextSearch.offset,3);assert.ok(first.nextSearch.criteriaKey);
 r=await run(first,[call('remember_preferences',{changes:[{field:'note',slot:null,value:null,quote:'удобнее'}]}),answer()],{messages:[{role:'user',content:'Хочу удобнее'}]});assert.deepEqual(r.context.nextSearch,first.nextSearch);
 const restored=conversationState.parse({...emptyConversation,context:r.context}).context;r=await more(restored);assert.deepEqual(r.cards.map(c=>c.item.id),[id(203)]);assert.equal(r.context.nextSearch.page,2);assert.equal(r.context.nextSearch.offset,0);
 r=await more(r.context);assert.deepEqual(r.cards.map(c=>c.item.id),[id(204),id(205)]);assert.equal(r.context.nextSearch,undefined);assert.deepEqual(queries.map(q=>q.page),[1,1,2]);
 const fixed=q=>({branchId:q.branchId,from:q.from,until:q.until,categoryId:q.categoryId,size:q.size,color:q.color});assert.ok(queries.every(q=>JSON.stringify(fixed(q))===JSON.stringify(fixed(queries[0]))));assert.equal(queries.length,3);
 const queryCount=queries.length;await more(r.context);assert.equal(queries.length,queryCount,'exhausted cursor never restarts page one');
 // Natural-language continuation uses the same cursor, not a fresh first-page search.
 r=await run(first,[call('more_dresses',{slot:'dress'}),answer([id(203)])]);assert.deepEqual(r.cards.map(c=>c.item.id),[id(203)]);assert.equal(queries.at(-1).page,1);
 // Changed dates or size invalidate the continuation without querying the old page.
 for(const changed of [{...first,from:'2026-10-03T12:00'},{...first,criteria:{...first.criteria,dress:{...first.criteria.dress,size:'146'}}}]){const before=queries.length;const stale=await more(changed);assert.equal(stale.context.nextSearch,undefined);assert.equal(queries.length,before);assert.match(stale.message,/устарело/)}
 r=await run(first,[call('remember_preferences',{changes:[{field:'color',slot:'dress',value:'Синий',quote:'синий'}]}),answer()],{messages:[{role:'user',content:'Лучше синий'}]});assert.equal(r.context.nextSearch,undefined);
 // A public product read grants exactly its returned option IDs, then select revalidates them.
 r=await run(base(),[call('get_product',{productId:id(100),executionId:''}),b=>{assert.equal(resultOf(b).options[0].id,id(200));return call('read_variant',{variantId:id(200)})},answer([id(200)])],{products:[refs[0]]});assert.equal(r.cards[0].item.id,id(200));assert.equal(variantReads.at(-1).variantId,id(200));
 const beforeForeign=variantReads.length;await run(base(),[call('get_product',{productId:id(100),executionId:''}),call('read_variant',{variantId:id(201)}),b=>{assert.equal(resultOf(b).error,'READ_OR_PREFERENCE_NOT_CONFIRMED');return answer()}],{products:[refs[0]]});assert.equal(variantReads.length,beforeForeign,'unreturned option never reaches CRM select');
 unpublishedProduct=true;await run(base(),[call('get_product',{productId:id(100),executionId:''}),call('read_variant',{variantId:id(200)}),answer()],{products:[refs[0]]});unpublishedProduct=false;assert.equal(variantReads.length,beforeForeign,'failed product read grants no IDs');
 await run(base(),[call('get_product',{productId:id(100),executionId:''}),()=>{unpublishedVariant=true;return call('read_variant',{variantId:id(200)})},b=>{assert.equal(resultOf(b).error,'READ_OR_PREFERENCE_NOT_CONFIRMED');return answer()}],{products:[refs[0]]});unpublishedVariant=false;
 // Four public products fit ONE bounded batch, optional variant rereads fit the second, then final.
 for(const n of [3,4]){
  const selected=refs.slice(0,n);r=await run(base(),[call('read_batch',{requests:selected.map(p=>({name:'get_product',productId:p.productId,executionId:''}))}),b=>{assert.equal(resultOf(b).results.length,n);return call('read_batch',{requests:groups.slice(0,n).map(g=>({name:'read_variant',variantId:g.variants[0].id}))})},b=>{assert.equal(b.tool_choice,'none');assert.equal(resultOf(b).results.length,n);return answer([],selected)}],{products:selected});assert.equal(r.comparisons.length,n);
 }
 // Three sequential needs use two legal function calls: patch, then search+rules batch, then answer.
 r=await run(base(),[call('remember_preferences',{changes:[{field:'color',slot:'dress',value:'Синий',quote:'синий'}]}),call('read_batch',{requests:[{name:'find_dresses',slot:'dress'},{name:'get_rental_rules'}]}),b=>{assert.equal(b.tool_choice,'none');const results=resultOf(b).results;assert.equal(results.length,2);assert.equal(results[0].result.cards.length,3);assert.equal(results[1].result.carePolicy,null);return answer([id(200)])}],{messages:[{role:'user',content:'Лучше синий. Покажи и расскажи правила.'}]});assert.equal(r.context.criteria.dress.color,'Синий');assert.equal(queries.at(-1).color,'Синий');
 const beforeInvalid=productReads.length;await run(base(),[call('read_batch',{requests:Array.from({length:5},()=>({name:'get_product',productId:id(100),executionId:''}))}),b=>{assert.equal(resultOf(b).error,'READ_OR_PREFERENCE_NOT_CONFIRMED');return answer()}],{products:refs});assert.equal(productReads.length,beforeInvalid,'oversized batch rejected before reads');
 await run(base(),[call('read_batch',{requests:[{name:'cancel_order'}]}),answer()]);assert.equal(productReads.length,beforeInvalid,'write operation cannot enter batch');
 assert.equal(CONSULTATION_LIMITS.modelCalls,3);assert.equal(CONSULTATION_LIMITS.toolCalls,2);assert.equal(CONSULTATION_LIMITS.crmReads,8);
 console.log(JSON.stringify({status:'PASS',realModelCalls:0,scriptedModelCalls:calls,coverage:'cursor/offset/page advance; overlap dedup; exhaustion; note preservation; date/size/colour invalidation; restored state; natural more; get_product option authorization and failed/depublished reads; 3/4 product compare in two single-call batches; correction+search+rules in three model responses; batch cap and no writes',liveSmoke:'BLOCKED: existing one-shot limiter is intentionally unchanged and rejects consultant request shape; byte bounds are not token/billing bounds.'},null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
