// Real list/query/export and SSR page; read-only in-memory data, no DB/network/env.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),ExcelJS=require('exceljs');
const org='de1e9e01-c7ad-45fc-899a-d2287f771355',a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
let session,overrides,rows,calls;
function reset(){
  session={organizationId:org,membershipId:'member',userId:'user',role:'DIRECTOR',hasOrganizationWideBranchAccess:false,allowedBranchIds:[a]};
  overrides=[{permissionKey:'PAYMENT_VIEW',effect:'DENY'}];calls=[];
  rows=[row('inside','2026-10-02T00:00:00Z','2026-10-03T00:00:00Z'),row('spans','2026-09-30T23:59:00Z','2026-10-05T00:00:00Z'),
    row('ends-at-from','2026-09-30T00:00:00Z','2026-10-01T00:00:00Z'),row('starts-at-until','2026-10-04T00:00:00Z','2026-10-05T00:00:00Z'),
    row('foreign','2026-10-02T00:00:00Z','2026-10-03T00:00:00Z',{organizationId:'foreign'}),
    row('other-branch','2026-10-02T00:00:00Z','2026-10-03T00:00:00Z',{branchId:b}),row('sale',null,null,{type:'SALE'})];
}
function row(id,start,end,extra={}){return {id,organizationId:org,branchId:a,orderNumber:id,type:'RENTAL',status:'DRAFT',channel:'CRM',
  rentalStartAt:start?new Date(start):null,rentalEndAt:end?new Date(end):null,totalMinor:1250n,currency:'KZT',createdAt:new Date('2026-09-30T00:00:00Z'),
  branch:{name:'A',timezone:'Asia/Qyzylorda'},customer:{customerNumber:'C1',firstName:'=Client',lastName:'Test',contacts:[{value:'+77001234567'}]},_count:{items:1},...extra};}
function matches(row,where){return Object.entries(where).every(([key,value])=>{
  if(value===undefined)return true;if(key==='OR')return value.some(part=>matches(row,part));if(key==='AND')return value.every(part=>matches(row,part));const actual=row[key];
  if(value===null||typeof value!=='object')return actual===value;
  if('in'in value)return value.in.includes(actual);
  if('lt'in value||'gt'in value)return actual!=null&&(value.lt===undefined||actual<value.lt)&&(value.gt===undefined||actual>value.gt);
  if('contains'in value)return String(actual??'').toLowerCase().includes(value.contains.toLowerCase());
  return actual!=null&&matches(actual,value);
});}
const db=new Proxy({}, {get(_target,table){
  if(table==='$transaction')return f=>f(db);if(table==='branch')return{findFirst:async q=>({id:q.where.id})};
  if(table==='organizationMembership')return {findMany:async()=>[],findFirst:async q=>q.where.organizationId===org?{role:session.role,permissionOverrides:overrides,branchAccess:session.allowedBranchIds.map(branchId=>({branchId}))}:null};
  assert.equal(table,'order','Unexpected DB model/write');return {count:async q=>rows.filter(row=>matches(row,q.where)).length,findMany:async q=>{
    calls.push(q);assert.equal(q.where.organizationId,org);assert.ok([50,200,5001].includes(q.take));
    return rows.filter(row=>matches(row,q.where)).slice(0,q.take);
  }};
}});
const wrapper=({children,action})=>React.createElement('div',null,action,children);
const allowed=new Set(['lib/orders/workspace.ts','lib/workflow-access.ts','lib/finance/payment-status.ts','lib/orders/list-filters.ts','lib/orders/queries.ts','lib/catalog/operation-policy.ts','lib/permissions/effective.ts','lib/permissions/registry.ts','lib/calendar/timezone.ts','generated/prisma/enums.ts','app/orders/page.tsx','app/orders/export/route.ts']);
const loaded=new Map();
function load(file){if(loaded.has(file))return loaded.get(file).exports;assert.ok(allowed.has(file),file);const record={exports:{}};loaded.set(file,record);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const req=name=>{
    if(name==='server-only'||name.endsWith('.css'))return {};if(name==='react')return {...React,cache:fn=>fn};
    if(name==='react/jsx-runtime')return require(name);if(name==='exceljs')return {default:ExcelJS};
    if(name==='@/generated/prisma/client')return load('generated/prisma/enums.ts');if(name==='@/lib/db')return {db};
    if(name==='@/lib/auth/session')return {getCurrentSession:async()=>session,requireRouteAccess:async()=>session};
    if(name==='@/lib/tenant/context')return {createTenantContext:organizationId=>({organizationId})};
    if(name==='@/lib/availability/capacity')return {getVariantAvailability:()=>{throw Error('Unexpected availability');}};
    if(name==='@/lib/finance/queries')return {getOrderPaymentListDetails:()=>{throw Error('Denied payments should not be read');}};
    if(name==='@/lib/orders/queries')return {...load('lib/orders/queries.ts'),getOrderFormOptions:async()=>({branches:[{id:a,name:'A'}],customers:[]})};
    if(name==='next/link')return {default:({href,children,...props})=>React.createElement('a',{href,...props},children)};
    if(name==='@/components/AppShell')return {AppShell:wrapper};if(name==='@/components/ui')return {EmptyState:({title})=>React.createElement('p',null,title),StatusChip:wrapper};
    if(name==='@/lib/ui/labels')return {ORDER_STATUS_LABELS:{DRAFT:'Черновик'},orderStatusLabel:x=>x,orderStatusTone:()=>'',orderTypeLabel:x=>x,orderChannelLabel:x=>x};
    if(name==='./errors')return {OrderError:class extends Error{}};if(name==='./list-filters')return load('lib/orders/list-filters.ts');
    if(name.startsWith('@/'))return load(name.slice(2)+'.ts');throw Error(name);
  };
  vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Date,console,Buffer,Response,Request,URL,URLSearchParams,Intl})(req,record,record.exports);return record.exports;
}
reset();const filters=load('lib/orders/list-filters.ts'),queries=load('lib/orders/queries.ts'),page=load('app/orders/page.tsx').default,route=load('app/orders/export/route.ts');
const request=raw=>new Request('https://example.invalid/orders/export?'+new URLSearchParams(raw));
const render=raw=>page({searchParams:Promise.resolve(raw)}).then(renderToStaticMarkup);
async function book(response){assert.equal(response.status,200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));return workbook;}
let passed=0;async function test(name,fn){reset();await fn();passed++;console.log('PASS '+name);}
async function main(){
  await test('valid UTC rental overlap is identical in real list and XLSX; exact boundaries exclude touching orders',async()=>{
    const raw={type:'RENTAL',from:'2026-10-01',until:'2026-10-04'};
    const list=await queries.getOrders({organizationId:org},filters.readOrderListFilters(raw),{allowedBranchIds:[a]});
    assert.deepEqual(list.map(x=>x.id),['inside','spans']);
    const workbook=await book(await route.GET(request(raw)));assert.equal(workbook.worksheets[0].rowCount,3);
    assert.deepEqual(workbook.worksheets[0].getColumn(1).values.slice(2),['inside','spans']);
    assert.equal(calls[0].where.rentalStartAt.lt.toISOString(),'2026-10-04T00:00:00.000Z');assert.equal(calls[1].where.rentalEndAt.gt.toISOString(),'2026-10-01T00:00:00.000Z');
  });
  await test('sale without dates remains available; sale plus rental dates errors before order/payment reads in UI and direct export',async()=>{
    const workbook=await book(await route.GET(request({type:'SALE'})));assert.equal(workbook.worksheets[0].getCell('A2').value,'sale');
    for(const raw of [{type:'SALE',from:'2026-10-01'},{type:'SALE',until:'2026-10-04'}]){
      calls=[];const response=await route.GET(request(raw));assert.equal(response.status,400);assert.ok((await response.text()).includes('не задан'));
      const html=await render(raw);assert.ok(html.includes('role="alert"'));assert.ok(html.includes('не задан'));assert.equal(html.includes('/orders/export?'),false);assert.equal(calls.length,0);
      assert.ok(html.includes('Тип периода'));
    }
  });
  await test('impossible/malformed dates, reversed/equal intervals and unsupported enum/UUID fail consistently',async()=>{
    for(const raw of [{from:'2026-02-30'},{until:'bad'},{from:'2026-1-1'},{from:'2026-10-04',until:'2026-10-01'},{from:'2026-10-01',until:'2026-10-01'},{type:'OTHER'},{status:'UNKNOWN'},{source:'INVALID'},{branchId:'bad'}]){
      calls=[];assert.equal((await route.GET(request(raw))).status,400);assert.ok((await render(raw)).includes('role="alert"'));assert.equal(calls.length,0);
    }
    calls=[];assert.equal((await route.GET(new Request('https://example.invalid/orders/export?from=2026-10-01&from=2026-10-02'))).status,400);
    assert.ok((await render({from:['2026-10-01','2026-10-02']})).includes('только один раз'));assert.equal(calls.length,0);
  });
  await test('one-sided ranges and all-type rental dates preserve existing predicates; leap dates are valid',async()=>{
    for(const raw of [{from:'2026-10-01'},{until:'2026-10-04'},{from:'2024-02-29'}]){
      const parsed=filters.readOrderListFilters(raw);await queries.getOrders({organizationId:org},parsed,{allowedBranchIds:[a]});await route.GET(request(raw));
      const [list,exported]=calls.slice(-2);assert.equal(JSON.stringify(list.where),JSON.stringify(exported.where));
    }
    assert.equal(filters.readOrderListFilters({type:'SALE',from:'',until:''}).from,undefined);
  });
  await test('scope, search/status/channel, permissions and no-store XLSX protections survive',async()=>{
    const raw={q:'inside',type:'RENTAL',status:'DRAFT',source:'CRM',branchId:a};const response=await route.GET(request(raw));
    assert.equal(response.headers.get('Cache-Control'),'private, no-store');const workbook=await book(response);const sheet=workbook.worksheets[0];
    assert.equal(sheet.rowCount,2);assert.equal(sheet.getCell('F2').value,"'=Client Test");assert.equal(sheet.getCell('L2').value,1250);assert.equal(sheet.columnCount,14);
    assert.equal(sheet.views[0].ySplit,1);assert.equal(sheet.getCell('I2').value,'02.10.2026, 05:00');
    assert.equal((await route.GET(request({branchId:b}))).status,403);
    session.allowedBranchIds=[];assert.equal((await book(await route.GET(request({})))).worksheets[0].rowCount,1);
    for(const key of ['ORDER_VIEW','ORDER_EXPORT']){reset();overrides.push({permissionKey:key,effect:'DENY'});calls=[];assert.equal((await route.GET(request({}))).status,403);assert.equal(calls.length,0);}
    reset();session=null;assert.equal((await route.GET(request({}))).status,401);
  });
  await test('real SSR explains rental UTC period and preserves validated filters in export link; export cap stays bounded',async()=>{
    const html=await render({from:'2026-10-01',until:'2026-10-04',type:'RENTAL',source:'CRM'});
    assert.ok(html.includes('Пересечение аренды'));assert.ok(html.includes('UTC (не включая)'));assert.ok(html.includes('source=CRM'));assert.ok(html.includes('name="source"'));
    rows=Array.from({length:5001},(_,i)=>row('large-'+i,null,null,{type:'SALE'}));assert.equal((await route.GET(request({type:'SALE'}))).status,413);assert.equal(calls.at(-1).take,5001);
  });
  console.log(`Order list filters regression: ${passed}/${passed}; actual query/page/export and XLSX roundtrip, no real DB/network/writes.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
