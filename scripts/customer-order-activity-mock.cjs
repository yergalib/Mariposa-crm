// Actual activity service, permissions/branch helper, page and card link; synthetic reads only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const org='de1e9e01-c7ad-45fc-899a-d2287f771355',a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const uuid=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0'),customerId=uuid(1000),otherCustomerId=uuid(1001);
let actor,role,overrides,grants,active,customer,events,calls;
function event(n,extra={}){return {id:uuid(n),organizationId:org,eventType:'CONFIRMED',fromStatus:'RESERVED',toStatus:'CONFIRMED',createdAt:new Date('2026-10-05T07:00:00Z'),createdBy:{displayName:'Operator',email:'hidden-email'},payload:{totalMinor:'123456789',note:'hidden-note',token:'hidden-token'},
  order:{id:uuid(500),organizationId:org,customerId,branchId:a,orderNumber:'O-1',type:'RENTAL',totalMinor:987654321n,branch:{name:'Main'}},...extra};}
function reset(){role='OWNER';actor={organizationId:org,membershipId:'member',role};overrides=[];grants=[a];active=true;customer={id:customerId,organizationId:org,customerNumber:'C-1',firstName:'Customer',lastName:null,contacts:[{value:'hidden-phone'}],notes:[{text:'hidden-note'}],status:'ARCHIVED'};events=[event(1)];calls=[];}
function setRole(value){role=value;actor={...actor,role:value};}
function matches(row,where={}){return Object.entries(where).every(([key,value])=>{
  if(value===undefined)return true;if(key==='AND')return value.every(part=>matches(row,part));if(key==='OR')return value.some(part=>matches(row,part));
  const actual=row[key];if(value instanceof Date)return actual instanceof Date&&actual.getTime()===value.getTime();
  if(value===null||typeof value!=='object')return actual===value;
  if('in'in value)return value.in.includes(actual);if('gte'in value||'lt'in value)return (value.gte===undefined||actual>=value.gte)&&(value.lt===undefined||actual<value.lt);
  return actual!=null&&matches(actual,value);
});}
function project(row,select){return Object.fromEntries(Object.entries(select).map(([key,value])=>[key,value===true?row[key]:row[key]==null?null:project(row[key],value.select)]));}
function hasTenant(where){return where.organizationId===org||where.AND?.some(hasTenant);}
const db=new Proxy({}, {get(_target,model){
  if(model==='organizationMembership')return {findFirst:async q=>{assert.equal(q.where.organizationId,org);return active?{role,permissionOverrides:overrides,branchAccess:grants.map(branchId=>({branchId}))}:null;}};
  if(model==='customer')return {findFirst:async q=>{calls.push({model,method:'findFirst',q});assert.equal(q.where.organizationId,org);assert.equal(Object.keys(q.select).some(key=>['contacts','notes','addresses','orders'].includes(key)),false);return customer&&matches(customer,q.where)?project(customer,q.select):null;}};
  if(model!=='orderEvent')throw Error('Unexpected database model or write '+String(model));
  const read=q=>{
    assert.ok(hasTenant(q.where));assert.equal(Object.hasOwn(q.select,'payload'),false);assert.equal(Object.hasOwn(q.select,'createdByUserId'),false);
    if(q.select.order){assert.equal(Object.hasOwn(q.select.order.select,'totalMinor'),false);assert.equal(Object.hasOwn(q.select.order.select,'items'),false);}
    if(q.select.createdBy)assert.deepEqual(Object.keys(q.select.createdBy.select),['displayName']);
    return events.filter(row=>matches(row,q.where)).sort((x,y)=>y.createdAt-x.createdAt||y.id.localeCompare(x.id)).map(row=>project(row,q.select));
  };
  return {findMany:async q=>{calls.push({model,method:'findMany',q});assert.equal(q.take,51);return read(q).slice(0,q.take);},findFirst:async q=>{calls.push({model,method:'findFirst',q});return read(q)[0]??null;}};
}});
const cache=new Map();
function load(file){
  if(cache.has(file))return cache.get(file);const record={exports:{}};cache.set(file,record.exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const req=name=>{
    if(name==='server-only')return {};if(name==='@/lib/db')return {db};if(name==='react')return {...React,cache:fn=>fn};
    if(name==='@/lib/auth/session')return {requireRouteAccess:async()=>actor};
    if(name==='@/components/AppShell')return {AppShell:({children,action,title,subtitle})=>React.createElement('main',null,React.createElement('h1',null,title),React.createElement('p',null,subtitle),action,children)};
    if(name==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
    if(name==='next/navigation')return {notFound:()=>{throw Error('TEST_NOT_FOUND');}};
    if(name==='react/jsx-runtime')return require(name);
    if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('./'))return load(path.posix.join(path.posix.dirname(file),name)+'.ts');
    throw Error('Unexpected import '+name);
  };
  vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Date,console,Intl,URLSearchParams,process:{env:{}}})(req,record,record.exports);cache.set(file,record.exports);return record.exports;
}
reset();const activity=load('lib/customers/order-activity.ts'),permissions=load('lib/permissions/effective.ts'),staff=load('lib/staff/errors.ts');
const page=load('app/customers/[id]/activity/page.tsx'),link=load('app/customers/[id]/CustomerOrderActivityLink.tsx');
const query=(filters={},id=customerId)=>activity.getCustomerOrderActivity({organizationId:org},actor,id,filters);
const render=async (filters={},id=customerId)=>renderToStaticMarkup(await page.default({params:Promise.resolve({id}),searchParams:Promise.resolve(filters)}));
let passed=0;async function test(name,fn){reset();await fn();passed++;console.log('PASS '+name);}
(async()=>{
  await test('both permissions required; explicit DENY and tenant mismatch before data reads',async()=>{
    setRole('SELLER');overrides=[{permissionKey:'ORDER_VIEW',effect:'DENY'}];await assert.rejects(query(),permissions.PermissionError);assert.equal(calls.length,0);
    overrides=[{permissionKey:'CUSTOMER_VIEW',effect:'DENY'}];await assert.rejects(query(),permissions.PermissionError);assert.equal(calls.length,0);
    await assert.rejects(activity.getCustomerOrderActivity({organizationId:'foreign'},actor,customerId,{}),permissions.PermissionError);assert.equal(calls.length,0);
  });
  await test('inactive owner rejects without reading customer or events',async()=>{active=false;await assert.rejects(query(),staff.StaffError);assert.equal(calls.length,0);});
  await test('invalid/missing/foreign customer fails without an event query',async()=>{
    assert.equal(await query({},'bad'),null);assert.equal(calls.length,0);
    customer.organizationId='foreign';assert.equal(await query(),null);assert.deepEqual(calls.map(call=>call.model),['customer']);
    reset();customer=null;assert.equal(await query(),null);assert.deepEqual(calls.map(call=>call.model),['customer']);
  });
  await test('fresh branch and customer/order tenant scoping; cached grants ignored',async()=>{
    setRole('SELLER');actor.allowedBranchIds=[a,b];const base=event(1);
    events=[base,event(2,{organizationId:'foreign'}),event(3,{order:{...base.order,organizationId:'foreign'}}),event(4,{order:{...base.order,customerId:otherCustomerId}}),event(5,{order:{...base.order,branchId:b}})];
    assert.deepEqual((await query()).rows.map(row=>row.id),[uuid(1)]);grants=[];assert.equal((await query()).rows.length,0);
  });
  await test('historical/archived customer and order events remain readable; no current catalog query',async()=>{
    const base=event(1);events=[base,event(2,{eventType:'SALE_FULFILLED',order:{...base.order,type:'SALE',branchId:b}})];
    grants=[];const result=await query();assert.equal(result.rows.length,2);assert.equal(result.customer.customerNumber,'C-1');assert.equal(calls.some(call=>call.model==='productVariant'),false);
  });
  await test('strict dates/order, duplicate params, types and cursor syntax',async()=>{
    for(const value of [{from:'2026-02-30'},{from:'0000-01-01'},{from:'2026-2-01'},{from:'2026-10-06',to:'2026-10-05'},{from:['','2026-10-05']},{type:'ANY'},{cursor:'x'},{unexpected:'1'}])assert.throws(()=>activity.readCustomerOrderActivityFilters(value),activity.CustomerOrderActivityError);
    assert.equal(activity.readCustomerOrderActivityFilters({from:'2024-02-29'}).from,'2024-02-29');
  });
  await test('date filter uses inclusive calendar UTC by event record time, not rental period',async()=>{
    events=[event(1,{createdAt:new Date('2026-10-05T00:00:00Z')}),event(2,{createdAt:new Date('2026-10-04T23:59:59.999Z')}),event(3,{createdAt:new Date('2026-10-06T00:00:00Z')})];
    assert.deepEqual((await query({from:'2026-10-05',to:'2026-10-05'})).rows.map(row=>row.id),[uuid(1)]);
    const base=events[0];events.push(event(4,{order:{...base.order,type:'SALE'}}));assert.deepEqual((await query({type:'SALE'})).rows.map(row=>row.id),[uuid(4)]);
  });
  await test('stable pagination aggregates multiple orders and equal timestamps without loss or duplication',async()=>{
    const base=event(1);events=Array.from({length:112},(_,i)=>event(i+1,{order:{...base.order,id:uuid(500+i%3),orderNumber:'O-'+i%3}}));const seen=[];let cursor;
    do{const result=await query(cursor?{cursor}:{});assert.ok(result.rows.length<=50);seen.push(...result.rows.map(row=>row.id));cursor=result.nextCursor;}while(cursor);
    assert.equal(seen.length,112);assert.equal(new Set(seen).size,112);
  });
  await test('newer concurrent event does not duplicate the prior page',async()=>{
    events=Array.from({length:55},(_,i)=>event(i+1));const first=await query();events.push(event(100,{createdAt:new Date('2026-10-05T08:00:00Z')}));const second=await query({cursor:first.nextCursor});assert.equal(second.rows.length,5);assert.equal(second.rows.some(row=>first.rows.some(old=>old.id===row.id)),false);
  });
  await test('foreign customer/tenant/branch/filter cursor is rejected without broad event read',async()=>{
    setRole('SELLER');const base=event(1);events=[base,event(2,{order:{...base.order,customerId:otherCustomerId}}),event(3,{order:{...base.order,branchId:b}}),event(4,{organizationId:'foreign'}),event(5,{order:{...base.order,type:'SALE'}})];
    for(const filters of [{cursor:uuid(2)},{cursor:uuid(3)},{cursor:uuid(4)},{cursor:uuid(99)},{cursor:uuid(5),type:'RENTAL'}]){calls=[];await assert.rejects(query(filters),activity.CustomerOrderActivityError);assert.equal(calls.some(call=>call.method==='findMany'),false);}
    events[0].order.branchId=b;await assert.rejects(query({cursor:uuid(1)}),activity.CustomerOrderActivityError);
  });
  await test('no payload, money, contacts/notes/email, Inquiry or financial reads even with finance DENY',async()=>{
    setRole('SELLER');overrides=['PAYMENT_VIEW','DEPOSIT_VIEW','CUSTOMER_BALANCE_VIEW'].map(permissionKey=>({permissionKey,effect:'DENY'}));
    const result=await query(),html=await render();for(const marker of ['123456789','987654321','hidden-phone','hidden-note','hidden-email','hidden-token']){assert.equal(JSON.stringify(result).includes(marker),false);assert.equal(html.includes(marker),false);}
    assert.ok(calls.every(call=>['customer','orderEvent'].includes(call.model)));
  });
  await test('real page uses existing event/status labels, safe order links and escapes stored names',async()=>{
    const base=event(1);events=[event(1,{createdBy:null,order:{...base.order,orderNumber:'<script>bad</script>',branch:{name:'<img src=x>'}}})];
    let html=await render();assert.ok(html.includes('Бронь подтверждена'));assert.ok(html.includes('Без пользователя'));assert.ok(html.includes('&lt;script&gt;'));assert.equal(html.includes('<script>'),false);assert.ok(html.includes('/orders/'+base.order.id));assert.ok(html.includes('время записи UTC'));
    events[0].eventType='RESERVATION_CREATED';html=await render();assert.ok(html.includes('Событие заказа'));assert.ok(html.includes('RESERVATION_CREATED'));
    events[0].eventType='__proto__';html=await render();assert.ok(html.includes('Событие заказа'));assert.ok(html.includes('__proto__'));
  });
  await test('real card link is permission gated and wired into existing customer card',async()=>{
    let html=renderToStaticMarkup(await link.CustomerOrderActivityLink({session:actor,customerId}));assert.ok(html.includes('/customers/'+customerId+'/activity'));
    setRole('SELLER');overrides=[{permissionKey:'ORDER_VIEW',effect:'DENY'}];assert.equal(await link.CustomerOrderActivityLink({session:actor,customerId}),null);await assert.rejects(render(),permissions.PermissionError);
    const source=fs.readFileSync('app/customers/[id]/page.tsx','utf8');assert.ok(source.includes('<CustomerOrderActivityLink session={s} customerId={id}/>'));
  });
  await test('empty/error/not-found flows and pagination links are recoverable',async()=>{
    let html=await render({cursor:'invalid'});assert.ok(html.includes('role="alert"'));assert.ok(html.includes('Начать заново'));assert.equal(calls.length,0);
    setRole('SELLER');grants=[];html=await render();assert.ok(html.includes('Сохранённых событий по выбранным фильтрам и доступным заказам нет.'));
    customer=null;await assert.rejects(render(),/TEST_NOT_FOUND/);
    reset();events=Array.from({length:51},(_,i)=>event(i+1));html=await render({type:'RENTAL'});assert.ok(html.includes('Следующие 50 событий'));assert.ok(html.includes('type=RENTAL'));assert.ok(html.includes('name="from"'));
    assert.equal(activity.customerOrderActivityHref(customerId,{type:'RENTAL',cursor:uuid(1)}),'/customers/'+customerId+'/activity?type=RENTAL');
  });
  console.log(`Customer order activity: ${passed}/${passed}; synthetic reads only, no live DB or external calls.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
