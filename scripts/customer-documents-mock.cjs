// Actual document service, permission resolver and server component. Read-only synthetic DB.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1), foreign=id(2), customerId=id(3), a=id(4), b=id(5), orderId=id(6), date=new Date('2026-10-01T10:00:00Z');
let role, overrides, branches, active, calls, missing, rows, memberPatch, snapshotReads;
const session={organizationId:org,membershipId:id(7),userId:id(8),role:'DIRECTOR'};
function reset() {
  role='DIRECTOR'; session.role=role; overrides=[]; branches=[a]; active=true; calls=[]; missing=false; memberPatch={}; snapshotReads=0;
  rows=Array.from({length:45},(_,i)=>({ id:id(100+i), organizationId:org, branchId:a, orderId,
    version:i+1, createdAt:date, snapshot:{secret:'unchanged'}, revisionReason:'PRIVATE', amountMinor:999,
    branch:{organizationId:org,status:'ACTIVE',name:'A',timezone:'Asia/Almaty'},
    order:{id:orderId,organizationId:org,branchId:a,customerId,type:'RENTAL',orderNumber:'RENT-1',
      branch:{organizationId:org,status:'ACTIVE'}} }));
}
function matches(row,where={}) { return Object.entries(where).every(([key,value])=>{
  if(value===undefined)return true;
  if(key==='OR')return value.some(part=>matches(row,part));
  const actual=row[key];
  if(value instanceof Date)return actual?.getTime()===value.getTime();
  if(value===null||typeof value!=='object')return actual===value;
  if('in' in value)return value.in.includes(actual);
  if('lt' in value)return actual<value.lt;
  return actual!=null&&matches(actual,value);
}); }
function project(row,select) { return Object.fromEntries(Object.entries(select).filter(([,v])=>v).map(([key,spec])=>{
  const value=row[key];return [key,spec===true?value:Array.isArray(value)?value.filter(v=>matches(v,spec.where)).map(v=>project(v,spec.select)):project(value,spec.select)];
})); }
class KnownError extends Error { constructor(code){super(code);this.code=code;} }
const db=new Proxy({}, {get(_target,table){
  if(!['organizationMembership','customer','order','rentalDocumentVersion'].includes(table))throw Error(`Forbidden DB model/write ${String(table)}`);
  return new Proxy({}, {get(_t,method){
    if(!['findFirst','findMany'].includes(method))throw Error(`Forbidden DB method ${String(method)}`);
    return async query=>{
      calls.push({table,method,query});
      assert.equal(query.where.organizationId,org);
      if(table==='organizationMembership'){
        const member={id:session.membershipId,organizationId:org,userId:session.userId,status:active?'ACTIVE':'INACTIVE',organization:{status:'ACTIVE'},user:{status:'ACTIVE'},role,permissionOverrides:overrides,branchAccess:branches.map(branchId=>({branchId,branch:{status:'ACTIVE'}})),...memberPatch};
        return matches(member,query.where)?project(member,query.select):null;
      }
      if(table==='customer')return query.where.id===customerId?{id:customerId}:null;
      if(table==='order'){const order=rows.map(row=>row.order).find(row=>matches(row,query.where));return order?project(order,query.select):null;}
      if(missing)throw new KnownError('P2021');
      const found=rows.filter(row=>matches(row,query.where)).sort((x,y)=>y.createdAt-x.createdAt||y.id.localeCompare(x.id));
      if(method==='findFirst')return found[0]?project(found[0],query.select):null;
      assert.ok([21,100].includes(query.take)); assert.equal(query.skip,undefined);
      return found.slice(0,query.take).map(row=>project(row,query.select));
    };
  }});
}});
const savedPagePath='app/orders/[id]/documents/[documentId]/page.tsx';
const sources=new Set([savedPagePath,'lib/orders/documents.ts','lib/permissions/effective.ts','lib/permissions/registry.ts','app/customers/[id]/CustomerDocuments.tsx','lib/calendar/timezone.ts']);
const loaded=new Map();
function load(file){
  if(loaded.has(file))return loaded.get(file).exports;
  assert.ok(sources.has(file),`Unexpected source ${file}`);
  const moduleRecord={exports:{}};loaded.set(file,moduleRecord);
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const req=name=>{
    if(name==='server-only')return {};
    if(name==='@/lib/db')return {db};
    if(name==='react')return {...React,cache:fn=>fn};
    if(name==='react/jsx-runtime'||name==='zod')return require(name);
    if(name==='next/link')return {default:({href,children})=>React.createElement('a',{href},children)};
    if(name==='next/navigation')return {notFound:()=>{throw Error('NOT_FOUND');}};
    if(name==='@/lib/auth/session')return {requireRouteAccess:async route=>{assert.equal(route,'/orders');return session;}};
    if(name==='@/lib/orders/document-snapshot')return {readRentalSnapshot:snapshot=>{snapshotReads++;return snapshot;}};
    if(name==='@/components/RentalDocumentV1')return {RentalDocumentV1:({snapshot})=>React.createElement('article',null,snapshot.secret)};
    if(name==='@/components/PrintButton')return {PrintButton:()=>React.createElement('button',null,'PRINT')};
    if(name.endsWith('.css'))return {};
    if(name==='@/generated/prisma/client')return {Prisma:{PrismaClientKnownRequestError:KnownError}};
    if(name==='@/lib/audit/log')return {appendAuditLog:()=>{throw Error('Forbidden audit write');}};
    if(name==='@/lib/ui/labels'||name==='./document-snapshot')return {};
    if(name.startsWith('@/'))return load(name.slice(2)+(name.endsWith('CustomerDocuments')?'.tsx':'.ts'));
    throw Error(`Unexpected dependency ${name}`);
  };
  vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Date,console,Buffer})(req,moduleRecord,moduleRecord.exports);
  return moduleRecord.exports;
}
reset(); const service=load('lib/orders/documents.ts'), component=load('app/customers/[id]/CustomerDocuments.tsx');
const list=after=>service.listCustomerRentalDocuments(session,customerId,after);
const render=async after=>renderToStaticMarkup(await component.CustomerDocuments({session,customerId,after}));
const savedPage=load(savedPagePath).default;
const direct=()=>service.getRentalDocument(session,orderId,rows[0].id);
const print=()=>savedPage({params:Promise.resolve({id:orderId,documentId:rows[0].id})});
let passed=0;
async function test(name,fn){reset();await fn();passed++;console.log(`PASS ${name}`);}
async function main(){
  await test('stable bounded cursor pagination, tied timestamps, all versions once, metadata only',async()=>{
    const original=JSON.stringify(rows);let after,all=[];
    do{const page=await list(after);assert.ok(page.versions.length<=20);all.push(...page.versions);after=page.nextCursor;}while(after);
    assert.equal(all.length,45);assert.equal(new Set(all.map(v=>v.id)).size,45);
    assert.equal(JSON.stringify(rows),original);
    for(const row of all)assert.deepEqual(Object.keys(row).sort(),['branch','createdAt','id','order','orderId','version']);
    assert.equal(JSON.stringify(all).includes('secret'),false);assert.equal(JSON.stringify(all).includes('PRIVATE'),false);
  });
  await test('tenant, customer, branch, current order branch/type and inactive branch constraints',async()=>{
    const base=rows[0]; rows=[base,
      {...base,id:id(500),organizationId:foreign},
      {...base,id:id(501),branchId:b},
      {...base,id:id(502),order:{...base.order,branchId:b}},
      {...base,id:id(503),order:{...base.order,customerId:id(99)}},
      {...base,id:id(504),order:{...base.order,organizationId:foreign}},
      {...base,id:id(505),order:{...base.order,type:'SALE'}},
      {...base,id:id(506),branch:{...base.branch,status:'INACTIVE'}}];
    assert.equal((await list()).versions.length,1);
    branches=[];assert.equal((await list()).versions.length,0);
    branches=[a];assert.equal(await service.listCustomerRentalDocuments(session,id(99)),null);
    assert.equal(await service.listCustomerRentalDocuments(session,'invalid'),null);
  });
  await test('CUSTOMER_VIEW and ORDER_VIEW denies block service and hide component before document reads',async()=>{
    for(const key of ['CUSTOMER_VIEW','ORDER_VIEW']){reset();overrides=[{permissionKey:key,effect:'DENY'}];
      await assert.rejects(list());assert.equal(await render(),'');assert.equal(calls.some(c=>c.table==='rentalDocumentVersion'),false);}
    reset();active=false;await assert.rejects(list());
  });
  await test('existing role semantics and fresh owner membership scope',async()=>{
    for(const nextRole of ['OWNER','DIRECTOR','SELLER','CASHIER']){reset();role=nextRole;session.role=nextRole;assert.equal((await list()).versions.length,20);}
    branches=[];role='OWNER';session.role='OWNER';assert.equal((await list()).versions.length,20);
    active=false;await assert.rejects(list());
    active=true;role='DIRECTOR';overrides=[{permissionKey:'CUSTOMER_VIEW',effect:'DENY'}];await assert.rejects(list());
  });
  await test('foreign, wrong customer, malformed and inaccessible cursors fail closed',async()=>{
    for(const cursor of ['bad','',id(999),rows[0].id]){reset();if(cursor===id(100))rows[0].order.customerId=id(99);
      await assert.rejects(list(cursor));assert.equal(calls.some(c=>c.method==='findMany'),false);}
  });
  await test('component links exact versions, unsigned marker, pagination and recoverable empty/missing schema',async()=>{
    const html=await render();assert.ok(html.includes(`/orders/${orderId}/documents/${id(144)}`));
    assert.ok(html.includes('Не подписан'));assert.ok(html.includes('documentsAfter='));assert.ok(!html.includes('PRIVATE'));
    assert.ok(!html.includes('999'));rows=[];assert.ok((await render()).includes('Сохранённых документов пока нет'));
    missing=true;assert.ok((await render()).includes('Сохранённые документы пока недоступны'));
    missing=false;assert.ok((await render('invalid')).includes('К началу списка'));
  });
  await test('direct saved URL and print require both branches after an order moves; lists agree',async()=>{
    rows=[rows[0]];
    assert.equal((await direct()).snapshot.secret,'unchanged');
    assert.ok(renderToStaticMarkup(await print()).includes('PRINT'));assert.equal(snapshotReads,1);
    rows[0].order.branchId=b;
    for(const allowed of [[a],[b],[]]){
      branches=allowed;snapshotReads=0;
      assert.equal(await direct(),null);assert.equal((await list()).versions.length,0);
      const orderList=await service.listRentalDocuments(session,orderId);assert.ok(orderList===null||orderList.versions.length===0);
      await assert.rejects(print(),/NOT_FOUND/);assert.equal(snapshotReads,0);
    }
    branches=[a,b];assert.ok(await direct());assert.equal((await list()).versions.length,1);
    assert.equal((await service.listRentalDocuments(session,orderId)).versions.length,1);
    assert.ok(renderToStaticMarkup(await print()).includes('unchanged'));
    role='OWNER';session.role='OWNER';branches=[];assert.ok(await direct());
  });
  await test('snapshot query denies inactive or foreign branches, tenant/order mismatch and malformed URL',async()=>{
    for(const owner of [false,true])for(const target of ['branch','orderBranch'])for(const patch of [{status:'ARCHIVED'},{status:'INACTIVE'},{organizationId:foreign}]){
      reset();rows=[rows[0]];if(owner){role='OWNER';session.role='OWNER';branches=[];}
      Object.assign(target==='branch'?rows[0].branch:rows[0].order.branch,patch);
      assert.equal(await direct(),null);assert.equal((await list()).versions.length,0);
      await assert.rejects(print(),/NOT_FOUND/);assert.equal(snapshotReads,0);
    }
    for(const patch of [{organizationId:foreign},{order:{organizationId:foreign}},{order:{type:'SALE'}},{orderId:id(999)}]){
      reset();Object.assign(rows[0],patch.order?{order:{...rows[0].order,...patch.order}}:patch);
      assert.equal(await direct(),null);await assert.rejects(print(),/NOT_FOUND/);assert.equal(snapshotReads,0);
    }
    reset();calls=[];assert.equal(await service.getRentalDocument(session,'bad',rows[0].id),null);
    assert.equal(await service.getRentalDocument(session,orderId,'bad'),null);
    assert.equal(calls.some(c=>c.table==='rentalDocumentVersion'),false);
  });
  await test('direct URL rechecks active tenant/user membership and ORDER_VIEW before loading snapshot',async()=>{
    for(const patch of [{status:'INACTIVE'},{organizationId:foreign},{userId:id(999)},{organization:{status:'INACTIVE'}},{user:{status:'INACTIVE'}}]){
      reset();session.role='OWNER';memberPatch=patch;
      await assert.rejects(direct());await assert.rejects(print());assert.equal(snapshotReads,0);
      assert.equal(calls.some(c=>c.table==='rentalDocumentVersion'),false);
    }
    reset();session.role='OWNER';overrides=[{permissionKey:'ORDER_VIEW',effect:'DENY'}];
    await assert.rejects(direct());await assert.rejects(print());assert.equal(snapshotReads,0);
    assert.equal(calls.some(c=>c.table==='rentalDocumentVersion'),false);
    reset();overrides=[{permissionKey:'ORDER_VIEW',effect:'ALLOW'},{permissionKey:'CUSTOMER_VIEW',effect:'DENY'}];
    assert.ok(await direct());await assert.rejects(list());
    role='OWNER';session.role='OWNER';overrides=[{permissionKey:'ORDER_VIEW',effect:'DENY'}];assert.ok(await direct());
  });
  console.log(`Customer documents regression: ${passed}/${passed}; no DB/network/writes. Saved page/print authorization uses real service, stubbed renderer/session.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
