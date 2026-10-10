// Rendered route graph + release guard. No database, browser, external request or write.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const load=Module._load,resolve=Module._resolveFilename;let reads=0,writes=0,bodies=0;
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const card={id:id(1)+':default',productId:id(1),executionId:null,name:'Synthetic dress',color:null,execution:null};
class ShowroomError extends Error{constructor(message,status=400){super(message);this.status=status}}
const service={ShowroomError,publicBranches:async()=>{reads++;return [{id:id(3),city:'Synthetic',name:'Synthetic',timezone:'Asia/Almaty'}]},publicCategories:async()=>[{id:id(4),name:'Платья'}],publicBrowse:async()=>({items:[card],page:1,more:false}),publicProduct:async input=>{reads++;if(input.productId!==id(1))throw new ShowroomError('not public',404);return {...card,options:[{id:id(2),size:'140'}]}},submitPublicInquiry:async()=>{writes++}};
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
Module._load=function(id,...args){
 if(id==='server-only')return {};
 if(id==='@/lib/showroom/service'||(id==='./service'&&args[0].filename.endsWith('favorite-resolution.ts')))return service;
 if(id==='@/lib/assistant/chat/access')return {assistantConfigured:()=>false};
 if(id==='@/lib/auth/session')return {getCurrentSession:async()=>null};
 if(id==='@/lib/permissions/effective')return {hasPermission:async()=>false};
 if(id==='@/lib/showroom/http')return {pressureLimit:()=>{},boundedJson:async()=>{bodies++;throw Error('must not read body')},failure:error=>({status:error.status}),reply:value=>value};
 if(id==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
 if(id==='next/image')return {__esModule:true,default:({unoptimized,priority,...props})=>React.createElement('img',props)};
 if(id==='next/navigation')return {useRouter:()=>({replace(){}})};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
require.extensions['.css']=()=>{};
(async()=>{
 const Page=require('../app/showroom/page.tsx').default;
 const html=async params=>renderToStaticMarkup(await Page({searchParams:Promise.resolve(params)}));
 const home=await html({});assert.ok(home.includes('view=catalog'));assert.ok(home.includes('view=fitting'));assert.ok(home.includes('view=contacts'));assert.ok(home.includes('view=favorites'));
 const catalog=await html({view:'catalog',search:'платье'});assert.ok(catalog.includes('productId='+id(1)));assert.ok(catalog.includes('name="view" value="catalog"'));
 const detail=await html({view:'catalog',productId:id(1),back:'favorites'});assert.ok(detail.includes('← В избранное'));assert.ok(detail.includes('Запросить примерку'));assert.ok(detail.includes('Для примерки даты аренды не нужны. Бронь подтвердит сотрудник.'));
 const saved=await html({view:'favorites',items:id(1)+'.default,'+id(9)+'.default'});assert.ok(saved.includes('Избранное'));assert.ok(saved.includes('Проверяем сохранённые товары'));
 const before=reads,contact=await html({view:'contacts'}),fitting=await html({view:'fitting'});assert.equal(reads,before,'static contacts/fitting require no DB');
 for(const url of ['https://wa.me/77785274882','https://www.instagram.com/mariposa.kz/','https://2gis.kz/astana/geo/70000001088052748']){assert.ok(contact.includes(url));assert.equal(new URL(url).search,'')}
 assert.ok(!contact.includes('tel:'));assert.ok(contact.includes('Ежедневно 11:00–20:00'));assert.ok(contact.includes('цокольный этаж'));
 assert.ok(fitting.includes('type="date"'));assert.ok(fitting.includes('type="time"'));assert.ok(fitting.includes('Сотрудник поможет согласовать визит.'));assert.ok(!fitting.includes('replyContact'));
 const {InquiryForm}=require('../app/showroom/InquiryForm.tsx');
 const draft=renderToStaticMarkup(React.createElement(InquiryForm,{purpose:'fitting',item:{id:id(2),name:'Synthetic',size:'140',price:null,available:true},filters:{branchId:id(3),from:'2026-10-05T12:00',until:'2026-10-06T18:00',size:'140',search:''},branchLabel:'Synthetic',onNewSearch(){}}));
 assert.ok(!draft.includes('name="replyContact"'));assert.ok(draft.includes('Выбор не отправлен'));assert.ok(draft.includes(require('../app/showroom/site-content.ts').showroomContact.whatsapp));assert.ok(!draft.includes('Планируемая аренда:'));assert.ok(!draft.includes('2026-10-05 12:00'));assert.ok(draft.includes('Примерка ещё не подтверждена'));
 assert.equal(require('../lib/showroom/release.ts').PUBLIC_INQUIRY_INTAKE_OPEN,false);
 const {POST}=require('../app/api/showroom/inquiries/route.ts');assert.equal((await POST(new Request('https://example.invalid/api/showroom/inquiries',{method:'POST'}))).status,503);assert.equal(bodies,0);assert.equal(writes,0);
 console.log('PASS: rendered home/catalog/product/favorites/fitting/contacts links and back paths; owner-only clean contact URLs; no invented telephone/slot; intake closed in UI and API before body/DB; static contacts/fitting need no data read. Mock-only, not visual acceptance.');
})().catch(error=>{console.error(error);process.exitCode=1});
