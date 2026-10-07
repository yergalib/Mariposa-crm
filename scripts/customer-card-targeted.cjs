// Targeted customer-card boundaries: synthetic mocks, no DB/network/env.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'..'),id='00000000-0000-4000-8000-000000000001';let denied=new Set(),calls=[];
const session={organizationId:'org',allowedBranchIds:['a'],hasOrganizationWideBranchAccess:false};
const db={customer:{findFirst:async query=>{calls.push(query);return query.where.organizationId==='org'&&query.where.id===id?{id,firstName:'Synthetic',lastName:null,customerNumber:'C1',contacts:[]}:null}},order:{count:async query=>{calls.push(query);return 26},findMany:async query=>{calls.push(query);return []}}};
const permission={requirePermission:async(_session,key)=>{if(denied.has(key))throw new Error('DENIED '+key)}};
const deps={'server-only':{},'@/lib/db':{db},'@/lib/permissions/effective':permission,'@/lib/auth/session':{requireRouteAccess:async()=>session},'@/lib/tenant/context':{createTenantContext:organizationId=>({organizationId})},'@/lib/customers/normalization':{normalizeEmail:x=>x,normalizePhone:x=>x},'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},'next/navigation':{notFound(){throw Error('NOT_FOUND')}},'@/components/AppShell':{AppShell:({children})=>React.createElement('main',{},children)},'@/lib/calendar/timezone':{formatBusinessDateTime:()=>''}};
function load(file){const m={exports:{}},source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{URLSearchParams,Number,Error})(name=>{if(name in deps)return deps[name];if(name==='react/jsx-runtime')return require(name);if(name.startsWith('@/'))return load(name.slice(2)+'.ts');throw Error('Unexpected '+name)},m,m.exports);return m.exports}
(async()=>{
 const prefill=load('lib/orders/customer-prefill.ts').getOrderCustomerPrefill;
 assert.equal(await prefill(session,'bad-id'),null);assert.equal(calls.length,0);
 await prefill(session,id);assert.equal(calls[0].where.organizationId,'org');assert.equal(calls[0].where.status,'ACTIVE');assert.equal(calls[0].select.contacts.take,1);
 for(const key of ['CUSTOMER_VIEW','ORDER_CREATE']){denied=new Set([key]);calls=[];await assert.rejects(prefill(session,id),/DENIED/);assert.equal(calls.length,0)}denied.clear();
 const queries=load('lib/customers/queries.ts');calls=[];await queries.getCustomer({organizationId:'org'},id,[]);assert.equal(calls[0].include.orders.where.branchId.in.length,0);assert.equal(calls[0].include._count.select.orders.where.branchId.in.length,0);
 calls=[];await queries.getCustomerOrderHistory({organizationId:'org'},id,['a'],2,'SALE');assert.equal(calls[1].where.type,'SALE');assert.equal(calls[1].where.organizationId,'org');assert.equal(calls[1].where.customerId,id);assert.equal(calls[1].where.branchId.in[0],'a');assert.equal(calls[2].skip,25);assert.equal(calls[2].take,25);
 const Page=load('app/customers/[id]/orders/page.tsx').default;
 for(const key of ['CUSTOMER_VIEW','ORDER_VIEW']){denied=new Set([key]);calls=[];await assert.rejects(Page({params:Promise.resolve({id}),searchParams:Promise.resolve({})}),/DENIED/);assert.equal(calls.length,0)}denied.clear();
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({id}),searchParams:Promise.resolve({type:'SALE',page:'2'})}));assert(html.includes('page=1&amp;type=SALE'));assert(html.includes('Покупки'));
 console.log('PASS customer card: tenant/active prefill, permission denial before query, hidden-order scope, branch/type pagination, direct history route guards');
})().catch(error=>{console.error(error);process.exitCode=1});
