const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const load=Module._load,resolve=Module._resolveFilename;
const visible={branchId:'029dac34-94d7-490d-9047-0e198d8785ff',variantId:'11111111-1111-4111-8111-111111111111',from:'2026-10-02T10:00',until:'2026-10-03T18:00'};
let requested,preserved;const formElement={};
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
Module._load=function(id,...args){
 if(id==='./TabState')return {useTabState:(_b,_s,initial)=>[initial,()=>{}]};
 if(id==='./FavoriteButton')return {FavoriteButton:()=>null};
 if(id==='./AssistantLink')return {AssistantLink:()=>null};
 if(id==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'};
 if(id==='react')return {useEffect:()=>{},useRef:v=>({current:v}),useState:v=>[v,x=>{if(x&&typeof x==='object'&&'filters'in x)preserved=x}]};
 if(id==='./InquiryForm')return {InquiryForm:()=>null};
 if(id==='./ShowroomPresentation')return {PhotoPlaceholder:()=>null,priceText:()=>''};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const {ShowroomProductDetail}=require('../app/showroom/ShowroomProductDetail.tsx');
const {selectionInput}=require('../lib/showroom/contracts.ts');
const NativeFormData=global.FormData;global.FormData=class{constructor(form){assert.equal(form,formElement)}get(name){return visible[name]??null}};
global.fetch=async(url,options)=>{assert.equal(options.cache,'no-store');requested=Object.fromEntries(new URL(url,'https://example.invalid').searchParams);return {ok:true,json:async()=>({id:visible.variantId,name:'Synthetic',size:'104',execution:null,price:null,available:false})}};
function find(node,type){if(!node||typeof node!=='object')return null;if(node.type===type)return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child,type);if(result)return result}return null}
(async()=>{try{const tree=ShowroomProductDetail({product:{id:'p',name:'Synthetic',options:[{id:visible.variantId,size:'104'}]},branches:[{id:visible.branchId,name:'Synthetic branch',city:'Synthetic city',timezone:'Asia/Almaty'}]});const form=find(tree,'form');assert.ok(form);assert.equal(requested,undefined);await form.props.onSubmit({preventDefault(){},currentTarget:formElement});assert.deepEqual(requested,visible);assert.equal(preserved.item.id,visible.variantId);assert.equal(preserved.filters.from,visible.from);assert.equal(preserved.filters.until,visible.until);assert.equal(selectionInput.safeParse(requested).success,true);console.log('PASS: product form reads visible native dates and exact variant; no request before explicit submission; selected criteria preserved. Mock fetch only.')}finally{global.FormData=NativeFormData}})().catch(e=>{console.error(e);process.exitCode=1});
