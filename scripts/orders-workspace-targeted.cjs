const path=require('node:path');
// Real list/query/export and SSR page; in-memory data and audit capture, no DB/network/env.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),ExcelJS=require('exceljs');
const org='de1e9e01-c7ad-45fc-899a-d2287f771355',a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
let session,overrides,rows,calls; const sql=(strings,...values)=>({strings,values});
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
  if('lt'in value||'gt'in value||'gte'in value)return actual!=null&&(value.gte===undefined||actual>=value.gte)&&(value.lt===undefined||actual<value.lt)&&(value.gt===undefined||actual>value.gt);
  if('contains'in value)return String(actual??'').toLowerCase().includes(value.contains.toLowerCase());
  return actual!=null&&matches(actual,value);
});}
const db=new Proxy({}, {get(_target,table){
  if(table==='$queryRaw')return async query=>{const cutoff=query.values.flatMap(v=>v?.values??[]).find(v=>v instanceof Date);return rows.filter(r=>r.organizationId===org&&r.type==='RENTAL'&&!['CANCELLED','COMPLETED'].includes(r.status)&&(!cutoff||r.rentalEndAt<cutoff)&&(r.issued??0)-(r.returned??0)>(r.loss??0)).map(r=>({id:r.id}))};
  if(table==='financialTransaction')return {groupBy:async q=>{assert.equal(q.where.organizationId,org);return rows.filter(r=>q.where.orderId.in.includes(r.id)).map(r=>({orderId:r.id,_sum:{obligationEffectMinor:r.debt??0n,revenueEffectMinor:r.revenue??0n}}))}};
  if(table==='$transaction')return f=>f(db);if(table==='branch')return{findFirst:async q=>({id:q.where.id}),findMany:async q=>[{id:a,organizationId:org,timezone:'Asia/Almaty'},{id:b,organizationId:org,timezone:'America/New_York'}].filter(r=>matches(r,q.where))};
  if(table==='organizationMembership')return {findMany:async()=>[],findFirst:async q=>q.where.organizationId===org?{role:session.role,permissionOverrides:overrides,branchAccess:session.allowedBranchIds.map(branchId=>({branchId}))}:null};
  if(table==='auditLog')return{create:async q=>{assert.equal(q.data.organizationId,org);assert.equal(q.data.action,'DATA_EXPORTED');return q.data}};
  assert.equal(table,'order','Unexpected DB model/write');return {groupBy:async q=>Object.entries(rows.filter(row=>matches(row,q.where)).reduce((acc,row)=>{acc[row.status]=(acc[row.status]||0)+1;return acc},{})).map(([status,count])=>({status,_count:{_all:count}})),count:async q=>rows.filter(row=>matches(row,q.where)).length,findMany:async q=>{
    calls.push(q);assert.equal((q.where.AND?.[0]?.organizationId??q.where.organizationId),org);assert.ok([20,50,200,5001,10001].includes(q.take));
    return rows.filter(row=>matches(row,q.where)).slice(q.skip??0,(q.skip??0)+q.take);
  }};
}});
const wrapper=({children,action,subtitle})=>React.createElement('div',null,subtitle,action,children);
const allowed=new Set(['lib/audit/export.ts','lib/audit/log.ts','lib/orders/navigation.ts','lib/orders/workspace-quick.ts','lib/ui/reference.ts','lib/permissions/member.ts','components/WorkflowTabs.tsx','lib/orders/workspace.ts','lib/workflow-access.ts','lib/finance/payment-status.ts','lib/orders/list-filters.ts','lib/orders/queries.ts','lib/catalog/operation-policy.ts','lib/permissions/effective.ts','lib/permissions/registry.ts','lib/calendar/timezone.ts','generated/prisma/enums.ts','app/orders/page.tsx','app/orders/export/route.ts']);
const loaded=new Map();
function load(file){if(loaded.has(file))return loaded.get(file).exports;assert.ok(allowed.has(file),file);const record={exports:{}};loaded.set(file,record);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const req=name=>{
    if(name==='server-only'||name.endsWith('.css'))return {};if(name==='react')return {...React,cache:fn=>fn};
    if(name==='react/jsx-runtime')return require(name);if(name==='exceljs')return {default:ExcelJS};
    if(name==='@/generated/prisma/client')return {...load('generated/prisma/enums.ts'),Prisma:{sql,empty:{strings:[],values:[]}}};if(name==='@/lib/db')return {db};
    if(name==='@/lib/auth/session')return {getCurrentSession:async()=>session,requireRouteAccess:async()=>session};
    if(name==='@/lib/tenant/context')return {createTenantContext:organizationId=>({organizationId})};
    if(name==='@/lib/availability/capacity')return {getVariantAvailability:()=>{throw Error('Unexpected availability');}};
    if(name==='@/lib/finance/queries')return {getOrderPaymentListDetails:async()=>{assert.ok(!overrides.some(o=>o.permissionKey==='PAYMENT_VIEW'&&o.effect==='DENY'));return new Map()}};
    if(name==='@/lib/orders/queries')return {...load('lib/orders/queries.ts'),getOrderFormOptions:async()=>({branches:[{id:a,name:'A'}],customers:[]})};
    if(name==='next/link')return {default:({href,children,...props})=>React.createElement('a',{href,...props},children)};
    if(name==='@/components/WorkflowTabs')return load('components/WorkflowTabs.tsx');if(name==='@/components/AppShell')return {AppShell:wrapper};if(name==='@/components/ui')return {EmptyState:({title})=>React.createElement('p',null,title),StatusChip:wrapper};
    if(name==='@/lib/ui/labels')return {ORDER_STATUS_LABELS:{DRAFT:'Черновик'},orderStatusLabel:x=>x,orderStatusTone:()=>'',orderTypeLabel:x=>x,orderChannelLabel:x=>x};
    if(name==='./errors')return {OrderError:class extends Error{}};if(name==='./list-filters')return load('lib/orders/list-filters.ts');
    if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('./'))return load(path.posix.join(path.posix.dirname(file),name)+'.ts');throw Error(name);
  };
  vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Error,Date,Error,console,Buffer,Response,Request,URL,URLSearchParams,Intl})(req,record,record.exports);return record.exports;
}
reset();const filters=load('lib/orders/list-filters.ts'),queries=load('lib/orders/queries.ts'),page=load('app/orders/page.tsx').default,route=load('app/orders/export/route.ts');
const request=raw=>new Request('https://example.invalid/orders/export?'+new URLSearchParams(raw));
const render=raw=>page({searchParams:Promise.resolve(raw)}).then(renderToStaticMarkup);
async function book(response){assert.equal(response.status,200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));return workbook;}
let passed=0;async function test(name,fn){reset();await fn();passed++;console.log('PASS '+name);}
async function main(){
 const workspace=load('lib/orders/workspace.ts'),navigation=load('lib/orders/navigation.ts'),quick=load('lib/orders/workspace-quick.ts');
 const select=async(raw,now)=>{const where=await workspace.workspaceOrderWhere(session,filters.readOrderListFilters(raw),now);return rows.filter(row=>matches(row,where)).map(row=>row.id)};
 await test('Entire filtered status totals, independent pages, no missing status beyond first 50',async()=>{
  rows=Array.from({length:83},(_,i)=>row('n'+i,null,null,{status:i<65?'DRAFT':'CONFIRMED'}));
  rows.push(row('foreign',null,null,{organizationId:'foreign'}),row('hidden',null,null,{branchId:b}));
  const r=await workspace.listOrdersWorkspace(session,filters.readOrderListFilters({}),1,{DRAFT:'2'});
  assert.equal(r.total,83);assert.equal(r.statusCounts.DRAFT,65);assert.equal(r.statusCounts.CONFIRMED,18);
  const draft=r.columns.find(c=>c.status==='DRAFT'),confirmed=r.columns.find(c=>c.status==='CONFIRMED');
  assert.equal(draft.rows.length,20);assert.equal(draft.rows[0].id,'n20');assert.equal(draft.pages,4);assert.equal(confirmed.rows.length,18);assert.equal(confirmed.page,1);
  const last=await workspace.listOrdersWorkspace(session,filters.readOrderListFilters({status:'DRAFT'}),1,{DRAFT:'999999'});
  assert.equal(last.columns[0].page,4);assert.equal(last.columns[0].rows.length,5);
  const table=await workspace.listOrdersWorkspace(session,filters.readOrderListFilters({}),2);
  assert.equal(table.rows.length,33);assert.equal(table.total,r.total);
  for(const value of [Infinity,NaN,-1,1.5,['2'],'bad'])assert.equal(quick.workspacePage(value),1);
 });
 await test('Mine uses assignee, not author; seller/director branch scope and explicit filters intersect',async()=>{
  rows=[row('assigned',null,null,{assignedMembershipId:'member',createdByUserId:'other'}),row('authored',null,null,{assignedMembershipId:'other',createdByUserId:'user'}),row('outside',null,null,{assignedMembershipId:'member',branchId:b})];
  for(const role of ['SELLER','DIRECTOR']){session.role=role;assert.equal((await select({quick:'mine'})).join(','),'assigned');assert.equal((await select({quick:'mine',assignedMembershipId:'UNASSIGNED'})).length,0);await assert.rejects(()=>select({branchId:b}),/недоступен/)}
  session.allowedBranchIds=[];assert.equal((await select({quick:'mine'})).length,0);
 });
 await test('Today honors each branch midnight and DST; excludes completed pickup, includes partial pickup',async()=>{
  session.allowedBranchIds=[a,b];const now=new Date('2026-10-10T20:00Z');
  rows=[row('almaty','2026-10-10T19:00Z','2026-10-12T00:00Z'),row('before','2026-10-10T18:59Z','2026-10-12T00:00Z'),row('end','2026-10-11T19:00Z','2026-10-12T00:00Z'),row('ny','2026-10-10T04:00Z','2026-10-12T00:00Z',{branchId:b}),row('issued','2026-10-10T20:00Z','2026-10-12T00:00Z',{status:'ISSUED'}),row('partial','2026-10-10T20:00Z','2026-10-12T00:00Z',{status:'PARTIALLY_ISSUED'})];
  assert.equal((await select({quick:'pickups'},now)).join(','),'almaty,ny,partial');
  session.allowedBranchIds=[a];assert.equal((await select({quick:'pickups'},now)).join(','),'almaty,partial');
  const dst=quick.todayOrderWhere('pickups',[{id:b,timezone:'America/New_York'}],new Date('2026-11-01T15:00Z')).OR[0].rentalStartAt;
  assert.equal((dst.lt-dst.gte)/3600000,25);
 });
 await test('Return today / overdue retain physical outstanding less resolved losses, exact deadline',async()=>{
  const now=new Date('2026-10-10T10:00Z');
  rows=[row('due','2026-10-09T00:00Z','2026-10-10T09:00Z',{issued:3,returned:1,loss:1}),row('loss-resolved','2026-10-09T00:00Z','2026-10-10T09:00Z',{issued:3,returned:1,loss:2}),row('exact','2026-10-09T00:00Z','2026-10-10T10:00Z',{issued:1}),row('tomorrow','2026-10-09T00:00Z','2026-10-10T19:00Z',{issued:1}),row('cancelled','2026-10-09T00:00Z','2026-10-10T09:00Z',{issued:1,status:'CANCELLED'})];
  assert.equal((await select({quick:'returns'},now)).join(','),'due,exact');assert.equal((await select({quick:'overdue'},now)).join(','),'due');assert.equal((await select({overdue:'yes'},now)).join(','),'due');
 });
 await test('Debt rejects denied financial access before reads; positive ledger balance only, payment intersection',async()=>{
  calls=[];await assert.rejects(()=>select({quick:'debt'}),/прав/);assert.equal(calls.length,0);
  overrides=[];rows=[row('unpaid',null,null,{debt:100n,revenue:100n}),row('partial',null,null,{debt:50n,revenue:100n}),row('unaccrued',null,null),row('paid',null,null,{revenue:100n}),row('overpaid',null,null,{debt:-50n,revenue:100n}),row('foreign',null,null,{debt:100n,organizationId:'other'})];
  assert.equal((await select({quick:'debt'})).join(','),'unpaid,partial');assert.equal((await select({quick:'debt',payment:'PARTIAL'})).join(','),'partial');
  rows=Array.from({length:10001},(_,i)=>row('cap'+i,null,null));await assert.rejects(()=>select({quick:'debt'}),/10000/);const capped=await render({quick:'debt'});assert.ok(capped.includes('Выборка не рассчитана'));assert.ok(capped.includes('10000'));assert.ok(!capped.includes('Найдено 0'));assert.ok(!capped.includes('/orders/export?'));
 });
 await test('SSR navigation retains quick filters through board/table/calendar/export; per-column limits explicit',async()=>{
  rows=Array.from({length:65},(_,i)=>row('n'+i,'2026-10-10T05:00Z','2026-10-11T05:00Z',{assignedMembershipId:'member'}));
  const html=await render({quick:'mine',view:'kanban',page_DRAFT:'2'});
  assert.ok(html.includes('Показаны 21–40 из 65'));assert.ok(html.includes('page_DRAFT=3'));assert.ok(html.includes('page_DRAFT=1'));assert.ok(html.includes('quick=mine'));assert.ok(html.includes('name="quick" value="mine"'));assert.ok(!html.includes('Есть долг'));assert.ok(!html.includes('draggable'));
  const calendarHref=html.match(/href="(\/calendar\?[^"]+)"/)[1].replaceAll('&amp;','&');
  const context=new URL(calendarHref,'https://local.invalid').searchParams.get('workspace');
  assert.equal(navigation.calendarWorkspaceParams(context).quick,'mine');
  const selected=await select(navigation.calendarWorkspaceParams(context));assert.equal(selected.length,65);
  const wb=await book(await route.GET(request({quick:'mine'})));assert.equal(wb.worksheets[0].rowCount,66);
  overrides=[];assert.ok((await render({})).includes('Есть долг'));
  for(const invalid of [{quick:'bad'},{quick:['mine','debt']}])assert.ok((await render(invalid)).includes('role="alert"'));
  if(process.env.WORKSPACE_UI_EVIDENCE){fs.mkdirSync(process.env.WORKSPACE_UI_EVIDENCE,{recursive:true});for(const view of ['table','kanban'])fs.writeFileSync(path.join(process.env.WORKSPACE_UI_EVIDENCE,view+'.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px Arial;margin:24px;max-width:1280px}*{box-sizing:border-box}a{color:#514335}input,select,button{font:inherit;min-height:40px;max-width:100%}.toolbar{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden}.workspace-search{display:flex;gap:8px}.workspace-search input{min-width:0;flex:1}'+fs.readFileSync('app/orders/workspace.css','utf8')+'</style>'+await render({quick:'mine',view,page_DRAFT:'2'}));}
 });
 console.log(`Orders workspace: ${passed}/${passed}; real service/parser/SSR/export with read-only fixture adapter; no production or external DB.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
