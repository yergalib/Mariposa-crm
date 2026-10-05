// Actual service, permissions, branch helper, route and XLSX round-trip; synthetic reads only.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
const ExcelJS = require('exceljs'), React = require('react'), {renderToStaticMarkup} = require('react-dom/server');
const org = 'de1e9e01-c7ad-45fc-899a-d2287f771355', branch = '11111111-1111-4111-8111-111111111111', otherBranch = '22222222-2222-4222-8222-222222222222';
const actor = {organizationId:org,membershipId:'member',role:'DIRECTOR'};
let docs, items, receipts, grants, overrides, active, session, calls, limits, membershipRole;
function reset() {
  grants=[branch];overrides=[];active=true;session=actor;calls=[];limits={};membershipRole='DIRECTOR';
  docs=[{id:'purchase',organizationId:org,purchaseNumber:'P-1',status:'PARTIALLY_RECEIVED',currency:'KZT',createdAt:new Date('2026-10-01T00:00:00Z'),destinationBranchId:branch,
    destinationBranch:{organizationId:org,name:'Main'},supplier:{organizationId:org,name:'Supplier'},totalMinor:9007199254740993n}];
  items=[{id:'item',organizationId:org,purchaseId:'purchase',orderedQuantity:5,currency:'KZT',productNameSnapshot:'Archived name',variantNameSnapshot:'Old variant',skuSnapshot:'SKU-old',unitCostMinor:30n,lineTotalMinor:150n,sortOrder:0}];
  receipts=[{id:'receipt-line',organizationId:org,purchaseItemId:'item',quantity:2,currency:'KZT',purchaseReceipt:{organizationId:org,purchaseId:'purchase',branchId:branch},totalAcquisitionCostMinor:65n}];
}
function matches(row,where={}) {return Object.entries(where).every(([key,value])=>{
  if(value===undefined)return true;const actual=row[key];
  if(value===null||typeof value!=='object')return actual===value;
  if('in' in value)return value.in.includes(actual);
  if('gte' in value||'lt' in value)return (value.gte===undefined||actual>=value.gte)&&(value.lt===undefined||actual<value.lt);
  return matches(actual,value);
});}
function project(row,select){return Object.fromEntries(Object.entries(select).map(([key,value])=>[key,value===true?row[key]:project(row[key],value.select)]));}
const db = new Proxy({}, {get(_target,model){
  if(model==='$transaction')return async (fn,options)=>{assert.equal(options.isolationLevel,'RepeatableRead');return fn(db);};
  if(model==='organizationMembership')return {findFirst:async q=>{assert.equal(q.where.organizationId,org);return active?{role:membershipRole,permissionOverrides:overrides,branchAccess:grants.map(branchId=>({branchId}))}:null;}};
  if(model==='branch')return {findMany:async q=>{assert.equal(q.where.organizationId,org);return [{id:branch,name:'Main',organizationId:org},{id:otherBranch,name:'Other',organizationId:org}].filter(row=>matches(row,q.where)).map(row=>project(row,q.select));}};
  const rows={purchase:()=>docs,purchaseItem:()=>items,purchaseReceiptLine:()=>receipts}[model];
  if(!rows)throw Error('Unexpected database model or write '+String(model));
  return {findMany:async q=>{
    calls.push({model,q});assert.equal(q.where.organizationId,org);
    if(overrides.some(x=>x.permissionKey==='FINANCE_PURCHASE_COST_VIEW'&&x.effect==='DENY'))assert.equal(Object.keys(q.select).some(k=>/Minor$/.test(k)),false,'cost must not be queried');
    if(limits[model])return Array.from({length:limits[model]},()=>project(rows()[0],q.select));
    return rows().filter(row=>matches(row,q.where)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,q.take).map(row=>project(row,q.select));
  }};
}});
const cache=new Map();
function load(file){
  if(cache.has(file))return cache.get(file);
  const record={exports:{}};cache.set(file,record.exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  function req(name){
    if(name==='server-only')return {};
    if(name==='@/lib/db')return {db};
    if(name==='react')return {...React,cache:fn=>fn};
    if(name==='@/lib/auth/session')return {getCurrentSession:async()=>session,requireRouteAccess:async()=>actor};
    if(name==='@/lib/purchases/queries')return {listPurchases:async()=>({rows:[],costVisible:true})};
    if(name==='@/components/AppShell')return {AppShell:({children,action})=>React.createElement('main',null,action,children)};
    if(name==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
    if(['exceljs','react/jsx-runtime'].includes(name))return require(name);
    if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
    if(name.startsWith('./'))return load(path.posix.join(path.posix.dirname(file),name)+'.ts');
    throw Error('Unexpected import '+name);
  }
  vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Date,console,Intl,Buffer,URL,URLSearchParams,Request,Response,process:{env:{}}})(req,record,record.exports);
  cache.set(file,record.exports);return record.exports;
}
reset();const report=load('lib/purchases/report.ts'),workbook=load('lib/purchases/report-workbook.ts'),route=load('app/purchases/export/route.ts');
const permissions=load('lib/permissions/effective.ts');
const query=(filters={})=>report.getPurchaseReport({organizationId:org},actor,filters);
const get=(queryString='')=>route.GET(new Request('https://example.test/purchases/export'+queryString));
const deny=key=>overrides.push({permissionKey:key,effect:'DENY'});
let passed=0;
async function test(name,fn){reset();await fn();passed++;console.log('PASS '+name);}
async function roundtrip(result){const xlsx=new ExcelJS.Workbook();await xlsx.xlsx.load(await workbook.purchaseReportWorkbook(result));return xlsx;}
(async()=>{
  await test('snapshot items and actual receipt quantities/costs, no catalog or ledger reads',async()=>{
    const result=await query();assert.equal(result.lines[0].product,'Archived name');assert.equal(result.lines[0].ordered,5);assert.equal(result.lines[0].received,2);assert.equal(result.lines[0].remaining,3);assert.equal(result.lines[0].receivedCostMinor,65n);
    assert.deepEqual(calls.map(x=>x.model),['purchase','purchaseItem','purchaseReceiptLine']);
  });
  await test('tenant and fresh branch scope, independent of session cached branch grants',async()=>{
    docs.push({...docs[0],id:'foreign',organizationId:'foreign-org'},{...docs[0],id:'other',destinationBranchId:otherBranch});assert.equal((await query()).documents.length,1);
    grants=[];calls=[];assert.equal((await query()).documents.length,0);assert.deepEqual(calls.map(x=>x.model),['purchase']);
    grants=[branch];await assert.rejects(query({branchId:otherBranch}),permissions.PermissionError);
    await assert.rejects(report.getPurchaseReport({organizationId:'foreign'},actor,{}),permissions.PermissionError);
  });
  await test('both permissions mandatory, overrides and inactive membership deny before purchase reads',async()=>{
    deny('REPORT_FINANCE_VIEW');assert.equal((await get()).status,403);assert.equal(calls.length,0);
    reset();deny('PURCHASE_VIEW');assert.equal((await get()).status,403);assert.equal(calls.length,0);
    reset();active=false;assert.equal((await get()).status,403);assert.equal(calls.length,0);
  });
  await test('existing role defaults are unchanged; explicit grants do not implicitly grant cost visibility',async()=>{
    membershipRole='SELLER';assert.equal((await get()).status,403);assert.equal(calls.length,0);
    overrides=['PURCHASE_VIEW','REPORT_FINANCE_VIEW'].map(permissionKey=>({permissionKey,effect:'ALLOW'}));
    const result=await query();assert.equal(result.documents.length,1);assert.equal(result.costVisible,false);assert.equal(result.documents[0].totalMinor,null);
    membershipRole='OWNER';grants=[];docs.push({...docs[0],id:'other',destinationBranchId:otherBranch});assert.equal((await query()).documents.length,2);
  });
  await test('unauthenticated route returns 401 without database reads',async()=>{session=null;const response=await get();assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(calls.length,0);});
  await test('strict dates, duplicate/unknown parameters, status and branch syntax',async()=>{
    for(const qs of ['?from=2026-02-30','?from=0000-01-01','?from=2026-2-01','?from=2026-10-02&to=2026-10-01','?status=FAKE','?status=DRAFT&status=RECEIVED','?branchId=foreign','?from=&from=','?unexpected=1'])assert.equal((await get(qs)).status,400,qs);
    assert.equal(calls.length,0);assert.equal(report.readPurchaseReportFilters(new URLSearchParams('from=2024-02-29')).from,'2024-02-29');
  });
  await test('creation days UTC inclusive, receipts are lifetime rather than period expense',async()=>{
    docs.push({...docs[0],id:'before',createdAt:new Date('2026-09-30T23:59:59.999Z')},{...docs[0],id:'after',createdAt:new Date('2026-10-02T00:00:00Z')});
    const result=await query({from:'2026-10-01',to:'2026-10-01'});assert.equal(result.documents.length,1);assert.equal(result.lines[0].received,2);
    assert.equal(calls[0].q.where.createdAt.gte.toISOString(),'2026-10-01T00:00:00.000Z');assert.equal(calls[0].q.where.createdAt.lt.toISOString(),'2026-10-02T00:00:00.000Z');
  });
  await test('cost DENY prevents monetary selections, DTO values and XLSX columns',async()=>{
    deny('FINANCE_PURCHASE_COST_VIEW');const result=await query();assert.equal(result.documents[0].totalMinor,null);assert.equal(result.lines[0].receivedCostMinor,null);
    const xlsx=await roundtrip(result);for(const name of ['Закупки','Позиции','Итоги по статусу'])assert.equal(JSON.stringify(xlsx.getWorksheet(name).model).includes('мин. ед.'),false);
    assert.equal(JSON.stringify(xlsx.model).includes('9007199254740993'),false);
  });
  await test('XLSX roundtrip preserves large bigint exactly and escapes formula-like text',async()=>{
    docs[0].supplier.name=' =HYPERLINK("bad")';items[0].skuSnapshot='@SUM(1)';
    const xlsx=await roundtrip(await query());assert.equal(xlsx.getWorksheet('Закупки').getRow(2).getCell(7).value,'9007199254740993');
    assert.equal(xlsx.getWorksheet('Закупки').getRow(2).getCell(4).value,'\' =HYPERLINK("bad")');assert.equal(xlsx.getWorksheet('Позиции').getRow(2).getCell(5).value,"'@SUM(1)");
    assert.equal(xlsx.getWorksheet('Позиции').getRow(2).getCell(12).value,65);
  });
  await test('currency/status totals remain separate including drafts/cancellations',async()=>{
    docs.push({...docs[0],id:'usd',status:'DRAFT',currency:'USD',totalMinor:20n},{...docs[0],id:'cancelled',status:'CANCELLED',totalMinor:50n});
    const xlsx=await roundtrip(await query()),sheet=xlsx.getWorksheet('Итоги по статусу');assert.equal(sheet.rowCount,4);
    const rows=sheet.getRows(2,3).map(row=>row.values);assert.equal(rows.find(row=>row[2]==='USD')[7],20);assert.equal(rows.find(row=>row[1]==='Отменена')[7],50);
    assert.equal((await query({status:'DRAFT'})).documents.length,1);
  });
  await test('bounded exports reject without silent truncation and without further queries',async()=>{
    limits.purchase=5001;assert.equal((await get()).status,413);assert.deepEqual(calls.map(x=>x.model),['purchase']);
    reset();limits.purchaseItem=20001;assert.equal((await get()).status,413);assert.deepEqual(calls.map(x=>x.model),['purchase','purchaseItem']);
    reset();limits.purchaseReceiptLine=100001;assert.equal((await get()).status,413);
  });
  await test('inconsistent receipt parent/branch/currency and over-receipt reject report',async()=>{
    receipts[0].purchaseReceipt.purchaseId='wrong';assert.equal((await get()).status,409);
    reset();receipts[0].purchaseReceipt.branchId=otherBranch;assert.equal((await get()).status,409);
    reset();receipts[0].currency='USD';assert.equal((await get()).status,409);
    reset();receipts[0].quantity=6;assert.equal((await get()).status,409);
  });
  await test('real route XLSX response is private with safe attachment name',async()=>{
    const response=await get();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('content-disposition'),/^attachment; filename="mariposa-purchases-/);
    const xlsx=new ExcelJS.Workbook();await xlsx.xlsx.load(Buffer.from(await response.arrayBuffer()));assert.equal(xlsx.worksheets.length,4);
  });
  await test('real report page uses accessible native form; denied export link is hidden',async()=>{
    const page=load('app/purchases/report/page.tsx');let html=renderToStaticMarkup(await page.default());assert.ok(html.includes('action="/purchases/export"'));assert.ok(html.includes('name="from"'));assert.ok(html.includes('UTC'));assert.ok(html.includes('value="'+branch+'"'));assert.equal(html.includes('value="'+otherBranch+'"'),false);
    const list=load('app/purchases/page.tsx');
    html=renderToStaticMarkup(await list.default({searchParams:Promise.resolve({})}));assert.ok(html.includes('href="/purchases/report"'));
    deny('REPORT_FINANCE_VIEW');await assert.rejects(page.default(),permissions.PermissionError);
    html=renderToStaticMarkup(await list.default({searchParams:Promise.resolve({})}));assert.equal(html.includes('href="/purchases/report"'),false);
  });
  console.log(`Purchase report regression: ${passed}/${passed}; synthetic reads only, no live DB or external calls.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
