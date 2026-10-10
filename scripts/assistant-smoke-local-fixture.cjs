// Fixed synthetic CRM fixtures for the actual local consultation candidate. No DB.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');

const id=n=>String(n).padStart(8,'0')+'-1111-4111-8111-111111111111',org=id(1),branch=id(2),category=id(3);
process.env.STOREFRONT_ORGANIZATION_ID=org;
const groups=Array.from({length:8},(_,i)=>({id:id(100+i)+':default',productId:id(100+i),executionId:null,categoryId:category,name:'Synthetic '+i,color:'Белый',execution:null,variants:[{id:id(200+i),name:'Synthetic '+i,size:'140',execution:null,price:{amountMinor:String(10000+i*1000),currency:'KZT'},available:true}]}));
let queries=[],productReads=[],variantReads=[],unpublishedProduct=false,unpublishedVariant=false;
class ShowroomError extends Error{}
const service={ShowroomError,publicBranches:async()=>[{id:branch,name:'Synthetic',city:'Synthetic',timezone:'Asia/Almaty'}],publicCategories:async()=>[{id:category,name:'Платья'}],
 publicCatalog:async input=>{queries.push(input);return {items:input.page===1?groups.slice(0,4):[groups[2],groups[4],groups[5]],page:input.page,more:input.page===1,appliedColor:input.color}},
 publicProduct:async input=>{productReads.push(input);const g=groups.find(g=>g.productId===input.productId);if(!g||unpublishedProduct)throw new ShowroomError('Not public');return {...g,sizes:['140'],options:g.variants.map(v=>({id:v.id,size:v.size})),images:[]}},
 publicSelectedCard:async input=>{variantReads.push(input);const g=groups.find(g=>g.variants.some(v=>v.id===input.variantId));if(!g||unpublishedVariant)throw new ShowroomError('Not public');return {...input,categoryId:category,productId:g.productId,executionId:null,item:g.variants[0]}},publicSelection:async()=>{throw Error('unused')}};
const load=Module._load,resolve=Module._resolveFilename;Module._resolveFilename=function(k,...args){return resolve.call(this,k.startsWith('@/')?path.resolve(k.slice(2)):k,...args)};Module._load=function(k,...args){if(k==='server-only')return {};if(k==='@/lib/db'||k.includes('/photos')||k==='@/lib/audit/log')throw Error('Real data forbidden');if(k==='@/lib/showroom/service')return service;return load.call(this,k,...args)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts'),{emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts'),{createCrmTools}=require('../lib/assistant/chat/tools.ts');
const session={organizationId:org,allowedBranchIds:[branch],hasOrganizationWideBranchAccess:false};
const base=()=>{const c=emptyOutfit();c.from=new Date(Date.now()+2*86400000).toISOString().slice(0,16);c.until=new Date(Date.now()+4*86400000).toISOString().slice(0,16);c.criteria.dress={size:'140',color:'Белый',categoryId:category};return c};


module.exports=async function runSyntheticScenario(provider){
 const refs=groups.slice(0,4).map(g=>({productId:g.productId,executionId:null}));
 return runAssistantConversation({syntheticOnly:true,branchId:branch,context:base(),products:refs,messages:[{role:'user',content:'Это синтетический тест. Сравни четыре выбранных платья по данным инструментов, сохрани даты и цвет. Не создавай заявку.'}]},provider,await createCrmTools(session),AbortSignal.timeout(90000));
};
