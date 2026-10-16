// Entirely synthetic service; actual consultation and review pipeline. No DB.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,org=id(1),branch=id(2),category=id(3);
process.env.STOREFRONT_ORGANIZATION_ID=org;
const groups=[['Белый','18000'],['Синий','12000']].map(([color,price],i)=>({productId:id(10+i),executionId:null,name:`Тестовое платье ${color}`,color,variants:[{id:id(20+i),name:`Тестовое платье ${color}`,size:'140',execution:null,price:{amountMinor:price,currency:'KZT'},available:true}]}));
const reads=[];class ShowroomError extends Error{}
const service={ShowroomError,publicBranches:async()=>[{id:branch,name:'Тестовый филиал',city:'Тестовый город',timezone:'Asia/Almaty'}],publicCategories:async()=>[{id:category,name:'Платья'}],publicCatalog:async a=>{reads.push(a);return{items:groups.filter(g=>!a.color||g.color.toLowerCase()===a.color.toLowerCase()),more:false,appliedColor:a.color}},publicProduct:async a=>{const g=groups.find(g=>g.productId===a.productId);if(!g)throw new ShowroomError('Not public');return{...g,id:g.productId+':default',images:[],sizes:['140'],options:g.variants.map(v=>({id:v.id,size:v.size,price:v.price}))}},publicSelectedCard:async a=>{const g=groups.find(g=>g.variants[0].id===a.variantId);if(!g)throw new ShowroomError('Not public');return{...a,categoryId:category,productId:g.productId,executionId:null,item:g.variants[0]}}};
const load=Module._load,resolve=Module._resolveFilename;
Module._resolveFilename=function(k,...a){return resolve.call(this,k.startsWith('@/')?path.resolve(k.slice(2)):k,...a)};
Module._load=function(k,...a){if(k==='server-only')return{};if(k==='@/lib/db'||k.includes('/photos')||k==='@/lib/audit/log'||k.startsWith('@prisma/'))throw Error('REAL_DATA_FORBIDDEN');if(k==='@/lib/showroom/service')return service;if(k==='@/app/showroom/site-content')return{rentalSteps:['Выберите наряд','Примерьте в тестовом шоуруме','Верните после праздника'],showroomContact:{city:'Тестовый город',address:'Тестовый адрес',hours:'Тестовое расписание',whatsapp:'https://example.invalid/contact',map:'https://example.invalid/map'}};return load.call(this,k,...a)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts'),{emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts'),{createCrmTools}=require('../lib/assistant/chat/tools.ts');
module.exports=async function run(a,dir,maxTurns=3){
 let context=emptyOutfit();const from=new Date(Date.now()+7*86400000).toISOString().slice(0,10)+'T12:00',until=new Date(Date.now()+8*86400000).toISOString().slice(0,10)+'T18:00';
 Object.assign(context,{from,until,heightCm:138,notes:['Не люблю объёмные платья.'],calendarPeriod:true});context.criteria.dress={size:'140',color:'Белый',categoryId:category};
 const prompts=['Впервые беру платье напрокат. Подбери белое, размер 140, рост 138. Не люблю объёмные платья. Даты уже выбрала в календаре.','Лучше синее, остальные пожелания и даты те же. Есть вариант дешевле первого?','Как у вас проходит аренда и куда обратиться? Бронь уже подтверждена?'];
 const messages=[],results=[];
 for(const prompt of prompts.slice(0,maxTurns)){a.beginTurn();const reply=await runAssistantConversation({syntheticOnly:true,branchId:branch,context,messages:[...messages,{role:'user',content:prompt}]},a.provider,await createCrmTools({organizationId:org,allowedBranchIds:[branch],hasOrganizationWideBranchAccess:false}),AbortSignal.timeout(110000));
 const result={prompt,reply,checks:{datesPreserved:reply.context.from===from&&reply.context.until===until,heightPreserved:reply.context.heightCm===138,explicitSizePreserved:reply.context.criteria.dress.size==='140'}};
 fs.writeFileSync(path.join(dir,`turn-${results.length+1}.json`),JSON.stringify(result,null,2));results.push(result);context=reply.context;messages.push({role:'user',content:prompt},{role:'assistant',content:reply.message});
 if(a.closed)throw Error('RUN_CLOSED');
 }
 return {turns:results.length,checks:results.map(r=>r.checks),catalogReads:reads.length,databaseWrites:0,syntheticOnly:true};
};
