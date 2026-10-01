const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const load=Module._load,resolve=Module._resolveFilename;let slots=[],cursor=0,requests=[];
const hook=value=>{const i=cursor++;if(!(i in slots))slots[i]=value;return i};
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
Module._load=function(id,...args){if(id==='./TabState')return {useTabState:(_bucket,_schema,initial)=>{const i=hook(initial);return [slots[i],x=>{slots[i]=typeof x==='function'?x(slots[i]):x}]},useNewConversation:()=>()=>{}};if(id==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'};if(id==='react')return {useEffect:()=>{},useRef:v=>slots[hook({current:v})],useState:v=>{const i=hook(v);return [slots[i],x=>{slots[i]=typeof x==='function'?x(slots[i]):x}]}};if(id==='next/link')return ()=>null;if(id==='./ShowroomPresentation')return {PhotoPlaceholder:()=>null,priceText:()=> 'Уточнить стоимость'};return load.call(this,id,...args)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
function all(n,p){if(!n||typeof n!=='object')return [];return [...(p(n)?[n]:[]),...[n.props?.children].flat(Infinity).flatMap(c=>all(c,p))]}
const find=(n,p)=>{const r=all(n,p)[0];assert.ok(r,'expected UI element');return r};
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const {ShowroomProductDetail}=require('../app/showroom/ShowroomProductDetail.tsx'),{InquiryForm}=require('../app/showroom/InquiryForm.tsx');
const product={id:id(1),productId:id(1),executionId:null,name:'Synthetic',color:null,execution:null,options:[{id:id(2),size:'140'}]},branches=[{id:id(3),name:'Synthetic',city:'Synthetic',timezone:'Asia/Almaty'}];
const render=()=>{cursor=0;return ShowroomProductDetail({product,branches})};
global.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
const data={branchId:id(3),variantId:id(2),from:'2026-10-05T12:00',until:'2026-10-06T18:00'};
global.FormData=class{get(name){return data[name]??''}};
const event={preventDefault(){},currentTarget:{}};
const answer=()=>({ok:true,json:async()=>({id:id(2),name:'Synthetic',size:'140',execution:null,price:null,available:true})});
(async()=>{
 let tree=render();find(tree,n=>n.type==='button'&&n.props.children==='Запросить примерку').props.onClick();assert.equal(requests.length,0);assert.equal(all(render(),n=>n.type===InquiryForm).length,0);
 for(const name of ['variantId','branchId','from','until']){tree=render();find(tree,n=>n.props?.name===name).props.onChange({target:{value:data[name]}})}
 tree=render();let form=find(tree,n=>n.type==='form');const pending=form.props.onSubmit(event);assert.equal(requests.length,1);assert.ok(requests[0].url.startsWith('/api/showroom/selection?'));assert.equal(requests[0].options.method,undefined);
 find(render(),n=>n.type==='button'&&n.props.children==='Отменить проверку').props.onClick();assert.equal(requests[0].options.signal.aborted,true);requests[0].resolve(answer());await pending;assert.equal(all(render(),n=>n.props?.role==='status').length,0);
 const checked=find(render(),n=>n.type==='form').props.onSubmit(event);requests[1].resolve(answer());await checked;tree=render();assert.ok(all(tree,n=>n.props?.role==='status').length);find(tree,n=>n.type==='button'&&n.props.children==='Запросить примерку').props.onClick();tree=render();const inquiry=find(tree,n=>n.type===InquiryForm);assert.equal(inquiry.props.purpose,'fitting');assert.ok(inquiry.props.requestText.includes('согласовать отдельно'));assert.equal(requests.length,2,'no inquiry write until explicit form submit');inquiry.props.onNewSearch();tree=render();assert.equal(find(tree,n=>n.props?.name==='from').props.value,data.from);assert.equal(find(tree,n=>n.props?.name==='variantId').props.value,id(2));
 find(tree,n=>n.type==='form').props.onChange();assert.equal(all(render(),n=>n.props?.role==='status').length,0,'changing any selection invalidates availability');
 console.log('PASS: product explicit selection GET; no premature inquiry; cancellation/stale result; fitting request semantics; dates/size preserved after back; change invalidates availability. Mock React/fetch only.');
})().catch(error=>{console.error(error);process.exitCode=1});
