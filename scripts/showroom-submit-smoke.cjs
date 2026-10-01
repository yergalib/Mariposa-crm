const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const load=Module._load,resolve=Module._resolveFilename;
const visible={branchId:'029dac34-94d7-490d-9047-0e198d8785ff',search:'',size:'',from:'2026-10-02T10:00',until:'2026-10-03T18:00'};
let requested,preserved;const formElement={};
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
Module._load=function(id,...args){
 if(id==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'};
 if(id==='react')return {useEffect:()=>{},useRef:v=>({current:v}),useState:v=>[v,x=>{if(x&&typeof x==='object'&&'branchId'in x)preserved=x}]};
 if(id==='@/lib/assistant/web-adapter')return {webSelectionAdapter:{findOptions:async(input,page)=>{requested={...input,page};return {items:[],more:false,page}}}};
 if(id==='./GuidedSelection')return {GuidedSelection:()=>null};
 if(id==='./ShowroomPresentation')return {PhotoPlaceholder:()=>null,ShowroomProductCard:()=>null};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const {Showroom}=require('../app/showroom/Showroom.tsx');
const {searchInput}=require('../lib/showroom/contracts.ts');
const NativeFormData=global.FormData;global.FormData=class{constructor(form){assert.equal(form,formElement)}get(name){return visible[name]??null}};
function find(node,type){if(!node||typeof node!=='object')return null;if(node.type===type)return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child,type);if(result)return result}return null}
try{const tree=Showroom({branches:[{id:visible.branchId,name:'Synthetic branch',city:'Synthetic city',timezone:'Asia/Almaty'}]});const form=find(tree,'form');assert.ok(form);form.props.onSubmit({preventDefault(){},currentTarget:formElement});assert.deepEqual(requested,{...visible,page:1});assert.deepEqual(preserved,visible);assert.equal(searchInput.safeParse(requested).success,true);console.log('PASS: visible native form dates override initially empty React state; sent criteria and retained filters match; server contract accepts them. No network/DB calls.')}finally{global.FormData=NativeFormData}
