// Actual read model, effective permissions/branch helper and server-rendered pages; synthetic reads only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const org='de1e9e01-c7ad-45fc-899a-d2287f771355',a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const uuid=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
let actor,role,overrides,grants,active,logs,calls;
function event(n,extra={}){return {id:uuid(n),organizationId:org,branchId:a,action:'FINANCIAL_TRANSACTION_POSTED',entityType:'Order',entityId:uuid(200),result:'SUCCESS',source:'CRM',occurredAt:new Date('2026-10-05T07:00:00Z'),
  actorUserId:uuid(300),branch:{name:'Main'},actorUser:{id:uuid(300),displayName:'Operator',email:'hidden-email'},metadata:{amountMinor:'123456789',password:'never-output'},correlationId:'hidden-correlation',...extra};}
function reset(){role='OWNER';actor={organizationId:org,membershipId:'member',role};overrides=[];grants=[a];active=true;logs=[event(1)];calls=[];}
function setRole(value){role=value;actor={...actor,role:value};}
function allow(){overrides.push({permissionKey:'AUDIT_LOG_VIEW',effect:'ALLOW'});}
function matches(row,where={}){return Object.entries(where).every(([key,value])=>{
  if(value===undefined)return true;if(key==='AND')return value.every(part=>matches(row,part));if(key==='OR')return value.some(part=>matches(row,part));
  const actual=row[key];if(value instanceof Date)return actual instanceof Date&&actual.getTime()===value.getTime();
  if(value===null||typeof value!=='object')return actual===value;
  if('in'in value)return value.in.includes(actual);if('not'in value)return actual!==value.not;
  if('gte'in value||'lt'in value)return (value.gte===undefined||actual>=value.gte)&&(value.lt===undefined||actual<value.lt);
  return actual!=null&&matches(actual,value);
});}
function project(row,select){return Object.fromEntries(Object.entries(select).map(([key,value])=>[key,value===true?row[key]:row[key]==null?null:project(row[key],value.select)]));}
function hasTenant(where){return where.organizationId===org||where.AND?.some(hasTenant);}
const db=new Proxy({}, {get(_target,model){
  if(model==='organizationMembership')return {findFirst:async q=>{assert.equal(q.where.organizationId,org);return active?{role,permissionOverrides:overrides,branchAccess:grants.map(branchId=>({branchId}))}:null;}};
  if(model==='branch')return {findMany:async q=>{assert.equal(q.where.organizationId,org);return [{id:a,organizationId:org,name:'Main'},{id:b,organizationId:org,name:'Other'}].filter(row=>matches(row,q.where)).map(row=>project(row,q.select));}};
  if(model==='user')return {findMany:async q=>[{id:uuid(300),displayName:'Operator',email:'hidden-email'}].filter(row=>matches(row,q.where)).map(row=>project(row,q.select))};
  if(model==='order')return {findMany:async q=>[{id:uuid(200),organizationId:org,branchId:a,branch:{organizationId:org,status:'ACTIVE'},orderNumber:'ORDER-READABLE'}].filter(row=>matches(row,q.where)).map(row=>project(row,q.select))};
  if(model==='customer'||model==='staffTask'||model==='inquiry')return {findMany:async()=>[]};
  if(model!=='auditLog')throw Error('Unexpected model or write '+String(model));
  const read=q=>{
    assert.ok(hasTenant(q.where),'query must include organization scope');
    assert.equal(Object.keys(q.select).some(key=>['metadata','correlationId','actorMembershipId','actorUserId'].includes(key)),false);
    if(q.select.actorUser)assert.deepEqual(Object.keys(q.select.actorUser.select),['displayName']);
    const sorted=logs.filter(row=>matches(row,q.where)).sort((x,y)=>y.occurredAt-x.occurredAt||y.id.localeCompare(x.id));
    return sorted.map(row=>project(row,q.select));
  };
  return {groupBy:async q=>{assert.ok(hasTenant(q.where));return [...new Set(logs.filter(row=>matches(row,q.where)).map(row=>row.actorUserId))].filter(Boolean).slice(0,q.take).map(actorUserId=>({actorUserId}));},findMany:async q=>{calls.push({method:'findMany',q});assert.equal(q.take,51);return read(q).slice(0,q.take);},findFirst:async q=>{calls.push({method:'findFirst',q});return read(q)[0]??null;}};
}});
const cache=new Map();
function load(file){
  if(cache.has(file))return cache.get(file);const record={exports:{}};cache.set(file,record.exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const req=name=>{
    if(name==='server-only')return {};if(name==='@/lib/db')return {db};if(name==='react')return {...React,cache:fn=>fn};
    if(name==='@/lib/auth/session')return {requireRouteAccess:async()=>actor};
    if(name==='@/components/AppShell')return {AppShell:({children})=>React.createElement('main',null,children)};
    if(name==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
    if(name==='react/jsx-runtime')return require(name);
    if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('./'))return load(path.posix.join(path.posix.dirname(file),name)+'.ts');
    throw Error('Unexpected import '+name);
  };
  vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Error,Date,console,Intl,URLSearchParams,process:{env:{}}})(req,record,record.exports);cache.set(file,record.exports);return record.exports;
}
reset();const view=load('lib/audit/view.ts'),permissions=load('lib/permissions/effective.ts'),staff=load('lib/staff/errors.ts'),registry=load('lib/permissions/registry.ts');
const query=(filters={})=>view.getAuditLogPage({organizationId:org},actor,filters);
const page=load('app/settings/audit/page.tsx'),settings=load('app/settings/page.tsx');
const render=async params=>renderToStaticMarkup(await page.default({searchParams:Promise.resolve(params??{})}));
let passed=0;async function test(name,fn){reset();await fn();passed++;console.log('PASS '+name);}
(async()=>{
  await test('existing role defaults and override DENY; no audit query before permission',async()=>{
    assert.equal(registry.defaultHasPermission('OWNER','AUDIT_LOG_VIEW'),true);
    for(const value of ['DIRECTOR','SELLER','CASHIER']){setRole(value);assert.equal(registry.defaultHasPermission(value,'AUDIT_LOG_VIEW'),false);await assert.rejects(query(),permissions.PermissionError);}
    assert.equal(calls.length,0);allow();assert.equal((await query()).rows.length,1);overrides=[{permissionKey:'AUDIT_LOG_VIEW',effect:'DENY'}];calls=[];await assert.rejects(query(),permissions.PermissionError);assert.equal(calls.length,0);
  });
  await test('tenant mismatch and inactive owner reject without reading events',async()=>{
    await assert.rejects(view.getAuditLogPage({organizationId:'foreign'},actor,{}),permissions.PermissionError);assert.equal(calls.length,0);
    active=false;await assert.rejects(query(),permissions.PermissionError);assert.equal(calls.length,0);
  });
  await test('fresh branch scope excludes foreign tenant, inaccessible branch and unassigned events',async()=>{
    setRole('DIRECTOR');allow();actor.allowedBranchIds=[a,b];logs=[event(1),event(2,{organizationId:'foreign'}),event(3,{branchId:b}),event(4,{branchId:null,branch:null})];
    assert.deepEqual((await query()).rows.map(row=>row.id),[uuid(1)]);await assert.rejects(query({branchId:b}),permissions.PermissionError);
    grants=[];assert.equal((await query()).rows.length,0);
  });
  await test('owner sees org-wide/unassigned and archived branch history; explicit branch narrows',async()=>{
    grants=[];logs=[event(1),event(2,{branchId:b}),event(3,{branchId:null,branch:null}),event(4,{organizationId:'foreign'})];
    assert.equal((await query()).rows.length,3);assert.deepEqual((await query({branchId:b})).rows.map(row=>row.id),[uuid(2)]);
  });
  await test('strict calendar dates, duplicate parameters, codes and enum validation',async()=>{
    for(const value of [{from:'2026-02-30'},{from:'0000-01-01'},{from:'2026-2-01'},{from:'2026-10-06',to:'2026-10-05'},{from:['','2026-10-05']},{source:'FAKE'},{result:'ANY'},{branchId:'foreign'},{cursor:'x'},{actorUserId:'bad'},{action:'x'.repeat(121)},{entityType:'x'.repeat(81)},{action:'<script>'},{unexpected:'1'}])assert.throws(()=>view.readAuditLogFilters(value),view.AuditLogFilterError);
    assert.equal(view.readAuditLogFilters({from:'2024-02-29'}).from,'2024-02-29');
  });
  await test('UTC inclusive calendar interval and exact action/entity/result/source filters',async()=>{
    logs=[event(1,{occurredAt:new Date('2026-10-05T00:00:00Z')}),event(2,{occurredAt:new Date('2026-10-04T23:59:59.999Z')}),event(3,{occurredAt:new Date('2026-10-06T00:00:00Z')}),event(4,{action:'OTHER'}),event(5,{entityType:'Customer'}),event(6,{source:'API'}),event(7,{result:'DENIED'})];
    const result=await query({from:'2026-10-05',to:'2026-10-05',action:'FINANCIAL_TRANSACTION_POSTED',entityType:'Order',source:'CRM',result:'SUCCESS'});assert.deepEqual(result.rows.map(row=>row.id),[uuid(1)]);
  });
  await test('stable 50-row keyset pagination traverses all equal-timestamp events once',async()=>{
    logs=Array.from({length:112},(_,i)=>event(i+1));const seen=[];let cursor;
    do{const result=await query(cursor?{cursor}:{});assert.ok(result.rows.length<=50);seen.push(...result.rows.map(row=>row.id));cursor=result.nextCursor;}while(cursor);
    assert.equal(seen.length,112);assert.equal(new Set(seen).size,112);assert.deepEqual(seen,logs.map(row=>row.id).reverse());
  });
  await test('newer concurrent inserts do not duplicate previously shown rows',async()=>{
    logs=Array.from({length:55},(_,i)=>event(i+1));const first=await query();logs.push(event(100,{occurredAt:new Date('2026-10-05T08:00:00Z')}));const second=await query({cursor:first.nextCursor});
    assert.equal(second.rows.length,5);assert.equal(second.rows.some(row=>first.rows.some(old=>old.id===row.id)),false);assert.equal(second.rows.some(row=>row.id===uuid(100)),false);
  });
  await test('cursor is resolved inside current tenant, branch and filters; inaccessible anchor fails closed',async()=>{
    setRole('DIRECTOR');allow();logs=[event(1),event(2,{branchId:b}),event(3,{organizationId:'foreign'}),event(4,{action:'OTHER'})];
    for(const filters of [{cursor:uuid(2)},{cursor:uuid(3)},{cursor:uuid(99)},{cursor:uuid(4),action:'FINANCIAL_TRANSACTION_POSTED'}]){calls=[];await assert.rejects(query(filters),view.AuditLogFilterError);assert.deepEqual(calls.map(call=>call.method),['findFirst']);}
    grants=[];await assert.rejects(query({cursor:uuid(1)}),view.AuditLogFilterError);
  });
  await test('arbitrary metadata, cost values, correlation and user email never selected or rendered',async()=>{
    const result=await query();assert.equal(JSON.stringify(result).includes('never-output'),false);assert.equal(JSON.stringify(result).includes('123456789'),false);assert.equal(JSON.stringify(result).includes('hidden-email'),false);
    const html=await render();assert.equal(html.includes('hidden-correlation'),false);assert.equal(html.includes('123456789'),false);assert.equal(html.includes('never-output'),false);
  });
  await test('server-rendered table escapes stored text, handles absent actor and branch',async()=>{
    logs=[event(1,{action:'<script>alert(1)</script>',entityId:'<img src=x>',actorUser:null,branchId:null,branch:null})];
    const html=await render();assert.equal(html.includes('&lt;script&gt;'),false);assert.equal(html.includes('<script>'),false);assert.ok(html.includes('Без пользователя'));assert.ok(html.includes('Без филиала'));assert.ok(html.includes('scope="col"'));assert.ok(html.includes('<time dateTime='));
  });
  await test('settings link respects permission and direct page denies before event reads',async()=>{
    setRole('DIRECTOR');let html=renderToStaticMarkup(await settings.default());assert.equal(html.includes('href="/settings/audit"'),false);await assert.rejects(render(),permissions.PermissionError);assert.equal(calls.length,0);
    allow();html=renderToStaticMarkup(await settings.default());assert.ok(html.includes('href="/settings/audit"'));
  });
  await test('invalid filter page is recoverable and never queries audit; empty scope has clear empty state',async()=>{
    let html=await render({cursor:'invalid'});assert.ok(html.includes('role="alert"'));assert.ok(html.includes('Начать заново'));assert.equal(calls.length,0);
    setRole('DIRECTOR');allow();grants=[];html=await render();assert.ok(html.includes('Событий по выбранным фильтрам нет.'));
  });
  await test('page links retain filters, reset cursor and scope branch choices',async()=>{
    setRole('DIRECTOR');allow();logs=Array.from({length:51},(_,i)=>event(i+1));const html=await render({action:'FINANCIAL_TRANSACTION_POSTED',source:'CRM'});
    assert.ok(html.includes('Следующие 50 событий'));assert.ok(html.includes('source=CRM'));assert.ok(html.includes('name="from"'));assert.ok(html.includes('value="'+a+'"'));assert.equal(html.includes('value="'+b+'"'),false);
    assert.equal(view.auditLogPageHref({source:'CRM',cursor:uuid(1)}),'/settings/audit?source=CRM');
  });
  await test('employee filter and pagination preserve exact actor; safe object links require entity permission',async()=>{
    logs=[event(1),event(2,{actorUserId:uuid(301)})];assert.deepEqual((await query({actorUserId:uuid(300)})).rows.map(row=>row.id),[uuid(1)]);
    assert.ok(view.auditLogPageHref({actorUserId:uuid(300)},uuid(1)).includes('actorUserId='+uuid(300)));
    let html=await render();assert.ok(html.includes('href="/orders/'+uuid(200)+'"'));assert.ok(html.includes('ORDER-READABLE'));assert.ok(html.includes('name="actorUserId"'));
    setRole('DIRECTOR');allow();overrides.push({permissionKey:'ORDER_VIEW',effect:'DENY'});html=await render();assert.equal(html.includes('href="/orders/'+uuid(200)+'"'),false);assert.equal(html.includes('ORDER-READABLE'),false);
    assert.equal(html.includes(uuid(200)),false);
  });
  console.log(`Audit log viewer: ${passed}/${passed}; synthetic read-only mock, no live DB or external calls.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
