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
const {createSyntheticRun,POLICY}=require('./lib/assistant-smoke-once.cjs');
const now=Date.parse('2026-10-09T12:00:00Z');
const refs=groups.slice(0,4).map(g=>({productId:g.productId,executionId:null}));
const tool=(call_id,name,args)=>({type:'function_call',call_id,name,arguments:JSON.stringify(args)});
const raw=(output,text='')=>({model:POLICY.model,service_tier:'default',status:'completed',output,output_text:text,usage:{input_tokens:24000,output_tokens:1400,total_tokens:25400,input_tokens_details:{cached_tokens:0,cache_write_tokens:24000},output_tokens_details:{reasoning_tokens:0}}});
const steps=[{type:'create',value:raw([{type:'reasoning',id:'rs_synthetic',summary:[]},tool('call_1','read_batch',{requests:refs.map(p=>({name:'get_product',productId:p.productId,executionId:''}))})])},{type:'create',value:raw([tool('call_2','read_batch',{requests:groups.slice(0,4).map(g=>({name:'read_variant',variantId:g.variants[0].id}))})])},{type:'create',value:raw([],JSON.stringify({message:'Сравнение по проверенным данным.',cardIds:[],productRefs:refs}))}];
(async()=>{
 const run=createSyntheticRun({steps,now:()=>now,expiresAt:now+60000});
 const result=await runAssistantConversation({syntheticOnly:true,branchId:branch,context:base(),products:refs,messages:[{role:'user',content:'Мне важно сравнить четыре платья.'},{role:'assistant',content:'Какие особенности важны?'},{role:'user',content:'Сравни выбранные варианты.'}]},run.provider,await createCrmTools(session),new AbortController().signal);
 assert.equal(result.comparisons.length,4);assert.equal(productReads.length,8);assert.equal(variantReads.length,4);assert.equal(run.calls.length,3);assert.equal(run.limited.consumed,3);
 for(let i=0;i<3;i++){const b=run.calls[i].body;assert.equal(run.calls[i].type,'create');assert.equal(run.calls[i].options.maxRetries,0);assert.equal(b.max_output_tokens,CONSULTATION_LIMITS.outputTokens);assert.ok(Object.isFrozen(b.input));assert.ok(b.tools.length);assert.equal(b.input.filter(x=>x.type==='function_call_output').length,i);assert.equal(b.input.filter(x=>x.role==='assistant').length,1);}
 assert.equal(run.calls[2].body.tool_choice,'none');
 await assert.rejects(()=>run.anotherProvider().create(run.calls[1].body,new AbortController().signal),/closed/);assert.equal(run.calls.length,3);
 console.log(JSON.stringify({status:'PASS',realRequests:0,syntheticHttpAttempts:3,preflightCalls:0,generationCalls:3,crmRunnerOperations:8,syntheticServiceReads:12,comparisons:4,reservedNano:run.limited.reservedNano,coverage:'actual orchestrator -> shared ChatProvider adapter -> immutable full request -> two sequential read_batch calls -> final; history, reasoning and tool outputs preserved; subsequent turn blocked'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
