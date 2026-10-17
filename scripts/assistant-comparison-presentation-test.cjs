const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
const load=Module._load;Module._load=function(k,...a){if(/^(?:node:)?(?:https?|net|tls)$/.test(k))throw Error('NETWORK_FORBIDDEN');return load.call(this,k,...a)};global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
require('./assistant-small-smoke-fixture.cjs');
require.extensions['.tsx']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{AssistantComparisonCard}=require('../app/showroom/AssistantProductCard.tsx');
const evidence=require('../docs/assistant-critical-manual-review-20261017.json'),products=evidence.rows.find(r=>r.id==='saved-products').turns[1].reply.comparisons;
const render=product=>renderToStaticMarkup(React.createElement(AssistantComparisonCard,{product}));
const [white,blue]=products.map(render);assert(/18[\s\u00a0\u202f]000 ₸/.test(white));assert(/12[\s\u00a0\u202f]000 ₸/.test(blue));
for(const html of [white,blue]){assert(html.includes('Размер 140:'));assert(html.includes('цена аренды в каталоге'));assert(html.includes('Наличие на выбранные даты ещё не проверено'));assert(!html.includes('Цена и наличие ещё не проверены'));assert(!html.includes('Доступно на выбранные даты'))}
const missing=structuredClone(products[0]);missing.options[0].price=null;assert(render(missing).includes('Уточнить стоимость'));delete missing.options[0].price;assert(render(missing).includes('Уточнить стоимость'));assert(!/18[\s\u00a0\u202f]000/.test(render(missing)));
console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,checks:['actual-two-comparison-components-render-prices','explicit-size-and-catalogue-label','availability-still-unknown','null-and-missing-prices-not-invented'],limitation:'SSR of actual components with recorded synthetic replies; not a new live model run or browser pixel check.'}));
