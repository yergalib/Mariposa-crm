// Actual finance page SSR with synthetic reads; no database or authentication sessions.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
let permissions=new Set(),kind='CASH_EXPENSE',reversal=null;
const row=()=>({id:'synthetic-expense',kind,branchId:'synthetic-branch',branch:{name:'Synthetic',timezone:'UTC'},occurredAt:new Date('2026-10-09'),amountMinor:100n,currency:'KZT',reversal});
const code=ts.transpileModule(fs.readFileSync('app/finance/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const m={exports:{}};
vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Date,Intl,URLSearchParams})(name=>{
 if(name==='react/jsx-runtime')return require(name);
 if(name==='next/link')return{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
 if(name==='@/components/AppShell')return{AppShell:({children})=>React.createElement('main',null,children)};
 if(name==='@/lib/auth/session')return{requireRouteAccess:async()=>({organizationId:'synthetic'})};
 if(name==='@/lib/tenant/context')return{createTenantContext:organizationId=>({organizationId})};
 if(name==='@/lib/finance/dashboard')return{getFinanceDashboard:async()=>({period:{fromLabel:'2026-10-01',untilLabel:'2026-10-09'},hasVisibleKinds:true,totals:[],recent:[row()],total:1,page:1,pages:1})};
 if(name==='@/lib/finance/filters')return{financeFilterOptions:async()=>({branches:[],methods:[],members:[]}),FINANCE_FILTER_KEYS:[]};
 if(name==='@/lib/permissions/effective')return{hasPermission:async(_,key)=>permissions.has(key)};
 if(name.includes('/ui/reference'))return{compactReference:value=>value};
 throw Error('Unexpected import '+name);
},m,m.exports);
(async()=>{const render=async()=>renderToStaticMarkup(await m.exports.default({searchParams:Promise.resolve({})}));
 permissions=new Set(['PAYMENT_REVERSE']);let html=await render();assert(!html.includes('/synthetic-expense/reverse'));assert(!html.includes('Исправить в кассе'));
 permissions=new Set(['CASH_CORRECT','CASH_ACCOUNT_VIEW']);html=await render();assert(html.includes('/cash/accounts?branchId=synthetic-branch'));assert(!html.includes('/synthetic-expense/reverse'));
 permissions.delete('CASH_ACCOUNT_VIEW');assert(!(await render()).includes('Исправить в кассе'));
 permissions.add('CASH_ACCOUNT_VIEW');reversal={id:'synthetic-correction'};assert(!(await render()).includes('Исправить в кассе'));
 reversal=null;kind='PAYMENT_RECEIVED';permissions=new Set(['PAYMENT_REVERSE']);assert((await render()).includes('/finance/synthetic-expense/reverse'));
 console.log('PASS F6 finance SSR: native cash route, required permissions, reversed expense hidden, customer reversal preserved');
})().catch(e=>{console.error(e);process.exitCode=1;});
