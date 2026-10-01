// Actual dashboard read model and UI; no real DB, env loading, writes or network.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
let ledger,overrides,grants,zone,role;
const now=new Date('2026-10-01T18:59:59Z'),org='org',a='a',b='b';
const actor={organizationId:org,membershipId:'member',userId:'user',role:'DIRECTOR',displayName:'Test'};
function reset(){
 zone='Asia/Almaty';role='DIRECTOR';grants=[a];
 overrides=['ORDER_VIEW','INVENTORY_VIEW','CATALOG_VIEW','FINANCE_PURCHASE_COST_VIEW'].map(permissionKey=>({permissionKey,effect:'DENY'}));ledger=[];
}
function row(kind,revenue,extra={}){return {id:`row-${ledger.length}`,kind,organizationId:org,branchId:a,orderId:'sale',customerId:'customer',currency:'KZT',
 sourceType:'ORDER_CHARGE',sourceId:'sale',order:{type:'SALE'},reversalOf:null,occurredAt:new Date('2026-09-30T19:00:00Z'),
 revenueEffectMinor:BigInt(revenue),cashEffectMinor:0n,depositEffectMinor:0n,obligationEffectMinor:0n,...extra};}
function matches(row,where={}){return Object.entries(where).every(([key,v])=>{
 if(v===undefined)return true;if(key==='OR')return v.some(x=>matches(row,x));
 const actual=row[key];if(v===null||typeof v!=='object')return actual===v;
 if('in'in v)return v.in.includes(actual);
 if('gte'in v||'lt'in v||'gt'in v)return (v.gte===undefined||actual>=v.gte)&&(v.lt===undefined||actual<v.lt)&&(v.gt===undefined||actual>v.gt);
 return matches(actual,v);
});}
function project(row,select){return Object.fromEntries(Object.entries(select).map(([k,v])=>[k,v===true?row[k]:row[k]==null?null:project(row[k],v.select)]));}
const db=new Proxy({}, {get(_target,table){
 if(table==='$transaction')return async fn=>fn(db);
 if(table==='organizationMembership')return {findFirst:async ({where})=>where.organizationId===org?{role,organization:{timezone:zone},permissionOverrides:overrides,branchAccess:grants.map(branchId=>({branchId}))}:null};
 if(table==='branch')return {findMany:async()=>[a,b].map(id=>({id,name:id,status:'ACTIVE'}))};
 if(table!=='financialTransaction')throw Error(`Unexpected DB model ${String(table)}`);
 return {findMany:async q=>{assert.equal(q.where.organizationId,org);return ledger.filter(x=>matches(x,q.where)).map(x=>project(x,q.select));},
 groupBy:async q=>{assert.equal(q.where.organizationId,org);const sums=new Map();for(const x of ledger.filter(x=>matches(x,q.where))){const sum=sums.get(x.currency)??{obligationEffectMinor:0n,depositEffectMinor:0n};sum.obligationEffectMinor+=x.obligationEffectMinor;sum.depositEffectMinor+=x.depositEffectMinor;sums.set(x.currency,sum);}return [...sums].map(([currency,_sum])=>({currency,_sum}));}};
}});
const wrapper=({children})=>React.createElement('div',null,children);
const stubs={'server-only':{},'@/lib/db':{db},'@/lib/catalog/economics':{getProductEconomicsSummariesWithClient:()=>{throw Error('Unexpected economics');}},'@/lib/finance/order-settlement':{},
 'next/link':{default:({href,children})=>React.createElement('a',{href},children)},'@/components/AppShell':{AppShell:wrapper},'@/components/ui':{SectionCard:wrapper,EmptyState:wrapper,StatusChip:wrapper},'@/components/ui/Icon':{Icon:()=>null},'@/components/OperationalItemSelector':{OperationalItemSelector:()=>null},'@/lib/auth/session':{requireRouteAccess:async()=>actor},'@/lib/tenant/context':{createTenantContext:organizationId=>({organizationId})},'@/lib/ui/labels':{DASHBOARD_WARNING_LABELS:{}}};
const allowed=new Set(['lib/dashboard/queries.ts','lib/calendar/timezone.ts','lib/finance/revenue-family.ts','lib/permissions/registry.ts','app/page.tsx']),cache=new Map();
function load(file){if(cache.has(file))return cache.get(file);assert.ok(allowed.has(file),file);const record={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const req=name=>{if(name in stubs)return stubs[name];if(name.endsWith('.css'))return {};if(name==='react/jsx-runtime')return require(name);if(name.startsWith('@/'))return load(name.slice(2)+'.ts');throw Error(name);};
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Date,console,Intl})(req,record,record.exports);cache.set(file,record.exports);return record.exports;}
reset();const dashboard=load('lib/dashboard/queries.ts'),page=load('app/page.tsx');
const query=(extra={})=>dashboard.getDashboard({organizationId:org},{preset:'CUSTOM',start:'2026-10-01',end:'2026-10-01',now,...extra},actor);
const amount=(rows,currency='KZT')=>BigInt(rows?.find(x=>x.currency===currency)?.amountMinor??0);
let passed=0;async function test(name,fn){reset();await fn();passed++;console.log(`PASS ${name}`);}
async function main(){
 await test('sale/rental/damage/ambiguous partitions conserve total including discounts and reversals',async()=>{
  const sale=row('SALE_CHARGE',1000),discount=row('DISCOUNT',-100);ledger=[sale,discount,row('REVERSAL',-200,{reversalOf:sale}),row('RENTAL_CHARGE',400,{order:{type:'RENTAL'}}),row('DAMAGE_CHARGE',50,{sourceType:'RETURN_DAMAGE_ASSESSMENT'}),row('SALE_CHARGE',30,{sourceId:'wrong'}),row('SALE_CHARGE',17,{currency:'USD'})];
  const result=await query(),f=result.financial;assert.equal(amount(f.saleAccruedRevenue),700n);assert.equal(amount(f.rentalAccruedRevenue),400n);assert.equal(amount(f.unattributedRevenue),30n);assert.equal(amount(f.otherRevenue),0n);
  for(const currency of ['KZT','USD'])assert.equal(['rentalAccruedRevenue','saleAccruedRevenue','damageCompensationAccrued','otherRevenue','unattributedRevenue'].reduce((n,key)=>n+amount(f[key],currency),0n),amount(f.netAccruedRevenue,currency));
 });
 await test('payments, refunds, deposits and their reversals never inflate sale accrual',async()=>{
  const payment=row('PAYMENT_RECEIVED',0,{cashEffectMinor:100n}),refund=row('CUSTOMER_REFUND',0,{cashEffectMinor:-20n});
  ledger=[row('SALE_CHARGE',100),payment,refund,row('REVERSAL',0,{reversalOf:refund,cashEffectMinor:20n}),row('DEPOSIT_RECEIVED',0,{cashEffectMinor:80n,depositEffectMinor:80n}),row('DEPOSIT_REFUNDED',0,{cashEffectMinor:-10n,depositEffectMinor:-10n})];
  const f=(await query()).financial;assert.equal(amount(f.saleAccruedRevenue),100n);assert.equal(amount(f.netCustomerPaymentCash),100n);assert.equal(amount(f.heldDeposits),70n);
 });
 await test('organization timezone inclusive start/exclusive end and previous period',async()=>{
  ledger=[row('SALE_CHARGE',100),row('SALE_CHARGE',200,{occurredAt:new Date('2026-09-30T18:59:59.999Z')}),row('SALE_CHARGE',400,{occurredAt:new Date('2026-10-01T19:00:00Z')})];
  const result=await query();assert.equal(result.period.rangeStart.toISOString(),'2026-09-30T19:00:00.000Z');assert.equal(amount(result.financial.saleAccruedRevenue),100n);assert.equal(result.financial.revenueComparison[0].previousMinor,'200');
  const spring=dashboard.dashboardPeriod({preset:'CUSTOM',start:'2026-03-08',end:'2026-03-08'},'America/New_York',now);assert.equal(spring.rangeEnd-spring.rangeStart,23*3600000);
  const fall=dashboard.dashboardPeriod({preset:'CUSTOM',start:'2026-11-01',end:'2026-11-01'},'America/New_York',now);assert.equal(fall.rangeEnd-fall.rangeStart,25*3600000);
 });
 await test('reversal follows its posting period even when source sale is outside the report',async()=>{
  const original=row('SALE_CHARGE',300,{occurredAt:new Date('2026-09-29T00:00:00Z')});
  ledger=[original,row('REVERSAL',-300,{reversalOf:original})];
  const f=(await query()).financial;assert.equal(amount(f.saleAccruedRevenue),-300n);assert.equal(amount(f.netAccruedRevenue),-300n);
 });
 await test('branch and tenant filters, empty scope, margin/dashboard denies',async()=>{
  ledger=[row('SALE_CHARGE',100),row('SALE_CHARGE',500,{branchId:b}),row('SALE_CHARGE',900,{organizationId:'other'})];
  assert.equal(amount((await query()).financial.saleAccruedRevenue),100n);assert.equal(await query({branchId:b}),null);
  grants=[];assert.equal(amount((await query()).financial.saleAccruedRevenue),0n);grants=[a];
  overrides.push({permissionKey:'FINANCE_MARGIN_VIEW',effect:'DENY'});assert.equal(Object.hasOwn((await query()).financial,'saleAccruedRevenue'),false);
  overrides.push({permissionKey:'FINANCE_DASHBOARD_VIEW',effect:'DENY'});assert.equal((await query()).financial,null);
 });
 await test('real page shows scoped sale subtotal and hides it on margin DENY',async()=>{
  ledger=[row('SALE_CHARGE',123)];const props={searchParams:Promise.resolve({period:'CUSTOM',start:'2026-10-01',end:'2026-10-01'})};
  let html=renderToStaticMarkup(await page.default(props));assert.ok(html.includes('Продажа'));assert.ok(html.includes('123 KZT'));assert.ok(html.includes('входят в общую'));
  overrides.push({permissionKey:'FINANCE_MARGIN_VIEW',effect:'DENY'});html=renderToStaticMarkup(await page.default(props));assert.equal(html.includes('Продажа'),false);
 });
 console.log(`Sale report regression: ${passed}/${passed}; mock reads only.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
