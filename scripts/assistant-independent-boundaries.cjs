// Independent adversarial cases, actual runtime; no provider network or DB.
const assert=require('node:assert/strict'),Module=require('node:module');
const load=Module._load;Module._load=function(k,...a){if(/^(?:node:)?(?:https?|net|tls)$/.test(k))throw Error('NETWORK_FORBIDDEN');return load.call(this,k,...a)};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {explicitColorCorrection}=require('../lib/assistant/chat/explicit-color-evidence.ts');
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts');
const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const negatives=['Не хочу синее.','Хочу не синее.','Хочу синее?','Хочу синее, но не сейчас.','Лучше синее или белое.','Теперь белое, кроме белого.','Тогда синее, если есть.','Хочу синее. Не надо сохранять цвет.','Хочу синее.\nНет, красное.','«Хочу синее».','Она сказала: хочу синее.','Лучше синее платье для обуви.','Хочу любой цвет.'];
for(const text of negatives)assert.equal(explicitColorCorrection(text),null,text);
assert.equal(explicitColorCorrection('Хочу синее платье.','shoes'),null);
for(const [text,color] of [['Лучше синее.','Синий'],['Теперь синий цвет, размер и даты оставь.','Синий'],['Лучше красное, подбери на те же даты.','Красный']])assert.equal(explicitColorCorrection(text),color);
const session={organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false};
const response=data=>({status:'completed',output:[],outputTokens:30,outputText:JSON.stringify(data)});
const final=extra=>response({message:'Учла.',preferenceChanges:[],cardIds:[],productRefs:[],factRefs:[],...extra});
const tool=(name,args)=>({...response({}),output:[{type:'function_call',name,call_id:name,arguments:JSON.stringify(args)}]});
async function run(steps,context,products=[]){let i=0;return runAssistantConversation({syntheticOnly:true,branchId:f.branch,context,products,messages:[{role:'user',content:'Покажи варианты'}]},{create:async b=>b.text.format.name==='conversation_boundary_review'?response({safeSentenceIds:[0],preferenceDecision:'allow',reason:'all_safe'}):steps[i++]},await createCrmTools(session),new AbortController().signal)}
(async()=>{
 const c=emptyOutfit();c.from=new Date(Date.now()+7*86400000).toISOString().slice(0,10)+'T12:00';c.until=new Date(Date.now()+8*86400000).toISOString().slice(0,10)+'T18:00';c.criteria.dress={size:'140',color:'Белый',categoryId:f.category};
 for(const id of [f.id(10),f.id(21),f.id(99)])await assert.rejects(()=>run([tool('find_dresses',{slot:'dress'}),final({cardIds:[id]})],c),/Карточка не подтверждена CRM/);
 for(const ref of [{productId:f.id(20),executionId:null},{productId:f.id(10),executionId:f.id(99)},{productId:f.id(99),executionId:null}])await assert.rejects(()=>run([tool('get_product',{productId:f.id(10),executionId:''}),final({productRefs:[ref]})],c,[{productId:f.id(10),executionId:null}]),/Сравнение нужно уточнить/);
 await assert.rejects(()=>createCrmTools({...session,organizationId:f.id(99)}),e=>e.status===403);
 const original=f.service.publicProduct;
 f.service.publicProduct=async()=>({...await original({productId:f.id(10)}),productId:f.id(99)});
 await assert.rejects(()=>run([tool('get_product',{productId:f.id(10),executionId:''}),final({productRefs:[{productId:f.id(10),executionId:null}]})],c,[{productId:f.id(10),executionId:null}]),/Сравнение нужно уточнить/);
 f.service.publicProduct=original;
 console.log(JSON.stringify({status:'PASS',negativeOrAmbiguousColors:14,positiveControls:3,rejectedIdOrTenantCases:8,networkCalls:0}));
})().catch(e=>{console.error(e);process.exitCode=1});
