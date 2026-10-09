// Actual assistant-ui runtime + production card components, synthetic typed DTOs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const load=Module._load,resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
require.extensions['.css']=()=>{};
Module._load=function(id,...args){if(id==='next/link')return {__esModule:true,default:({children,...props})=>require('react').createElement('a',props,children)};if(id==='next/image')return {__esModule:true,default:({unoptimized,priority,...props})=>require('react').createElement('img',props)};return load.call(this,id,...args);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
global.fetch=()=>{throw Error('NO NETWORK');};
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{AssistantThread}=require('../app/showroom/AssistantThread.tsx'),{AssistantProductCard,AssistantComparisonCard}=require('../app/showroom/AssistantProductCard.tsx');
let actions=0;const id='11111111-1111-4111-8111-111111111111';
const card={productId:id,executionId:null,branchId:id,from:'2026-12-10T12:00',until:'2026-12-11T18:00',item:{id,name:'<script>unsafe</script>',size:'140',execution:'Розовый',price:null,available:false},images:[{id,src:'/api/showroom/photo?imageId='+id,alt:'Real DTO photo',width:800,height:1200}],reasons:['Размер в каталоге: 140','CRM: недоступно на выбранные даты']};
const html=renderToStaticMarkup(React.createElement(AssistantThread,{messages:[{role:'assistant',content:'Проверенный результат',cards:[card]}],pending:false,onSend:async()=>{actions++;},onCancel:()=>{actions++;},renderMessage:m=>React.createElement('section',null,m.content,m.cards.map(c=>React.createElement(AssistantProductCard,{key:c.item.id,card:c,pending:false,onSelect:()=>{actions++;}})))}));
for(const token of ['&lt;script&gt;unsafe&lt;/script&gt;','/api/showroom/photo','Уточнить стоимость','На выбранные даты недоступно','Почему показан вариант','В избранное','branchId=','from=2026-12-10','size=140'])assert.ok(html.includes(token),token);
assert.ok(!html.includes('<script>'));assert.ok(!html.includes('costPrice'));assert.equal(actions,0);
const comparison=renderToStaticMarkup(React.createElement(AssistantComparisonCard,{product:{id,productId:id,executionId:null,name:'Saved DTO',color:null,execution:null,sizes:['140','146'],options:[],images:card.images}}));assert.ok(comparison.includes('Цена и наличие ещё не проверены'));assert.ok(comparison.includes('140, 146'));assert.ok(!comparison.includes('Выбрать в комплект'));
// Include established runtime history/escaping/pending tests in this same no-network run.
require('./assistant-ui-runtime-targeted.tsx');
console.log('PASS: actual assistant-ui renders typed product/photo/price/availability/reasons, preserved detail-link criteria, favourites control, safe comparison uncertainty, escaped names, zero actions on render.');
