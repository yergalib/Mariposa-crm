// Render the actual closed-intake path; no DB, network or real customer data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),load=Module._load,resolve=Module._resolveFilename;
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
Module._load=function(id,...args){if(id==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};return load.call(this,id,...args)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {handoffPreferences}=require('../lib/assistant/chat/handoff.ts');const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');const context={...emptyOutfit(),heightCm:138,from:'2026-10-05T12:00',until:'2026-10-06T18:00'};context.criteria.dress={size:null,color:'Розовый',categoryId:null};const preferences=handoffPreferences(context);assert.match(preferences,/Рост: 138 см/);assert.match(preferences,/размер уточнить/);assert.match(preferences,/Розовый/);assert.ok(preferences.length<2000);assert.equal(handoffPreferences({...context,organizationId:'forged'}),'Пожелания ещё не указаны.');assert.ok(!handoffPreferences({...context,criteria:{...context.criteria,dress:{...context.criteria.dress,color:'test@example.com'}}}).includes('test@example.com'));
const {InquiryForm}=require('../app/showroom/InquiryForm.tsx');
assert.equal(require('../lib/showroom/release.ts').PUBLIC_INQUIRY_INTAKE_OPEN,false);
const item={id:'11111111-1111-4111-8111-111111111111',name:'Synthetic dress A',execution:'Synthetic red execution',size:'140',price:{amountMinor:'987654',currency:'KZT'},available:true};
for(const purpose of ['booking','fitting']) {
 const html=renderToStaticMarkup(React.createElement(InquiryForm,{purpose,item,requestText:preferences,additionalItems:[{...item,id:'22222222-2222-4222-8222-222222222222',name:'Synthetic shoes B',execution:'Synthetic white execution',size:'35'}],filters:{branchId:'33333333-3333-4333-8333-333333333333',from:'2026-10-05T12:00',until:'2026-10-06T18:00',size:'140',search:''},branchLabel:'Synthetic showroom North',onNewSearch(){}}));
 assert.ok(html.includes('Рост: 138 см'));assert.ok(html.includes('Розовый'));assert.ok(html.includes('не отправляется'));assert.ok(html.includes('Synthetic showroom North'),'closed draft must retain chosen branch summary');
 assert.ok(html.includes('Synthetic dress A'));assert.ok(html.includes('Synthetic shoes B'),'closed draft must show the complete explicit selection');
 assert.ok(html.includes('Synthetic red execution'),'main execution must remain visible');assert.ok(html.includes('Synthetic white execution'),'additional execution must remain visible');
 assert.ok(html.includes('140'));assert.ok(html.includes('35'));assert.ok(html.includes('2026-10-05 12:00'));assert.ok(html.includes('2026-10-06 18:00'));
 assert.ok(!html.includes('replyContact'));assert.ok(!html.includes('987654'));assert.ok(!html.includes('<form'));assert.ok(html.includes('disabled=""'));
}
console.log('PASS: closed booking/fitting draft retains branch, all selected items and executions, sizes and rental period; no contact form, price claim or enabled submit. Static synthetic render only.');
