// Real notification/access code and actual route JSX; synthetic read boundaries only.
// No database, network, live sessions or model calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const out=path.resolve(process.env.INQUIRY_EVIDENCE_DIR||path.join(root,'crm-mobile-evidence'));fs.mkdirSync(out,{recursive:true});
const actor={organizationId:'org-a',membershipId:'owner-a',userId:'user-a',role:'OWNER',defaultBranchId:'branch-a'};
let member,reads=0,scopeReads=0;
const branch={name:'MARIPOSA · демофилиал',timezone:'Asia/Almaty',organizationId:'org-a',status:'ACTIVE'};
const base={id:'10000000-0000-4000-8000-000000000001',organizationId:'org-a',branchId:'branch-a',status:'NEW',subject:'Заявка с сайта: демонстрационное платье',source:'WEBSITE',createdAt:new Date('2026-10-21T04:28:01.457Z'),nextAction:null,nextActionAt:null,assignedMembershipId:null,assignedTo:null,branch};
let fixtures=[base,{...base,id:'assigned',assignedMembershipId:'someone-else'},{...base,id:'foreign',organizationId:'org-b'},{...base,id:'other-branch',branchId:'branch-b'},{...base,id:'inactive-branch',branch:{...branch,status:'INACTIVE'}},{...base,id:'processed',status:'IN_PROGRESS'}];
function reset(role='SELLER',keys=['LEAD_VIEW']){member={role,permissionRole:{permissionKeys:keys},permissionOverrides:[],branchAccess:[{branchId:'branch-a'}],active:true};reads=0;scopeReads=0;}
const empty={findMany:async()=>[]};
const db={$transaction:fn=>fn(db),organizationMembership:{findFirst:async q=>{scopeReads++;assert.equal(q.where.organizationId,actor.organizationId);assert.equal(q.where.userId,actor.userId);assert.equal(q.where.id,actor.membershipId);assert.equal(q.where.status,'ACTIVE');assert.equal(q.where.user.status,'ACTIVE');return member.active?member:null}},inquiry:{findMany:async q=>{reads++;const w=q.where;assert.equal(w.organizationId,actor.organizationId);assert.equal(w.branch.organizationId,actor.organizationId);assert.equal(w.branch.status,'ACTIVE');assert.equal(w.status,'NEW');assert(!('assignedMembershipId' in w));assert(q.take<=101);assert.deepEqual(Object.keys(q.select).sort(),['branch','createdAt','id','subject']);return fixtures.filter(r=>r.organizationId===w.organizationId&&r.status===w.status&&r.branch.status===w.branch.status&&r.branch.organizationId===w.branch.organizationId&&(!w.branchId||w.branchId.in.includes(r.branchId))).slice(0,q.take)}},staffTask:empty,fitting:empty,order:empty,payrollClaim:empty};
const routeRow={...base,customerLabel:'Демонстрационный клиент',replyContact:'client@example.com',requestText:'Хочет уточнить примерку.',requestedFrom:new Date('2026-10-23T05:00:00Z'),requestedUntil:new Date('2026-10-24T10:00:00Z'),requestedSize:'104–110',version:1,orderId:null,items:[{id:'item',productVariantId:'variant',nameSnapshot:'Демонстрационное платье',sizeSnapshot:'104–110',skuSnapshot:'DEMO-01'}]};
if(process.env.PURCHASE_RECORD_FILE){const saved=JSON.parse(fs.readFileSync(process.env.PURCHASE_RECORD_FILE,'utf8'));Object.assign(routeRow,{subject:saved.subject,source:saved.source,requestText:saved.requestText,requestedSize:saved.requestedSize,requestedFrom:saved.requestedFrom,requestedUntil:saved.requestedUntil,items:saved.items.create.map((item,i)=>({...item,id:'purchase-'+i}))});base.subject=saved.subject;}
const originalLoad=Module._load,originalResolve=Module._resolveFilename;
const mocks={
 'server-only':{},'@/lib/db':{db},
 'next/link':{__esModule:true,default:({children,...p})=>React.createElement('a',p,children)},
 'next/navigation':{notFound:()=>{throw Error('Not found')}},
 '@/lib/auth/session':{requireRouteAccess:async()=>actor},
 '@/lib/permissions/effective':{hasPermission:async()=>false,getEffectivePermissions:async()=>new Set(['LEAD_VIEW'])},
 '@/lib/auth/organizations':{getAvailableOrganizations:async()=>[]},
 '@/components/Sidebar':{Sidebar:()=>React.createElement('aside',{className:'sidebar'},React.createElement('h2',null,'MARIPOSA'),React.createElement('p',null,'Демонстрационная среда'),React.createElement('a',{href:'/chats'},'Чаты и обращения'))},
 '@/components/OrganizationSwitcher':{OrganizationSwitcher:()=>null},
 '@/components/NotificationRefresh':{NotificationRefresh:()=>null},
 '@/lib/inquiries/service':{inquiriesNotInstalled:()=>false,listInquiries:async()=>({rows:[routeRow],page:1,more:false}),inquiryBranches:async()=>[{id:'branch-a',name:branch.name}],getInquiry:async()=>routeRow,inquiryHistory:async()=>[],inquiryOptions:async()=>null},
 '@/lib/assistant/history/service':{inquiryConversation:async()=>process.env.INTEGRATION_CONVERSATION ? {expiresAt:new Date('2026-11-20T10:00:00Z'),messages:[{role:'user',content:'INTEGRATION_USER: платье на завтра, на один день'},{role:'assistant',content:'INTEGRATION_ASSISTANT: выдача 22.10, возврат 23.10 до 12:00'}]} : null},
 '@/app/workspace/actions':{updateInquirySelectionAction:()=>{throw Error('Mutation prohibited')}},
 '@/components/ConversionForm':{ConversionForm:()=>{throw Error('Unauthorized conversion rendered')}},
 '@/lib/workspace/conversion':{workflowOptions:()=>{throw Error('Unexpected conversion read')}},
};
Module._resolveFilename=function(name,parent,...rest){if(name.startsWith('@/'))name=path.join(root,name.slice(2));return originalResolve.call(this,name,parent,...rest)};
Module._load=function(name,parent,...rest){if(Object.hasOwn(mocks,name))return mocks[name];if(name==='./Sidebar'&&parent?.filename.endsWith('AppShell.tsx')&&mocks['@/components/Sidebar'])return mocks['@/components/Sidebar'];if(name==='./actions'&&parent?.filename.includes('chats'))return {saveInquiryAction:()=>{throw Error('Live action prohibited')}};if(name.endsWith('.css'))return {};return originalLoad.call(this,name,parent,...rest)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const {staffNotifications}=require('../lib/staff/notifications.ts');
async function resolveTree(node){node=await node;if(Array.isArray(node))return Promise.all(node.map(async(child,index)=>{const resolved=await resolveTree(child);return React.isValidElement(resolved)?React.cloneElement(resolved,{key:resolved.key??index}):resolved}));if(!React.isValidElement(node))return node;if(typeof node.type==='function'){if(node.type.name==='RevealSectionLink')return React.createElement('span',{'data-reveal-fixture':node.props.target},node);if(['ClaimInquiryForm','InquiryForm','RetainedActionForm','ContextPanel','MobileNavigation'].includes(node.type.name))return React.cloneElement(node,{},await resolveTree(node.props.children));return resolveTree(node.type(node.props));}return React.cloneElement(node,{},await resolveTree(node.props.children))}

mocks['@/generated/prisma/client']=require('../generated/prisma/enums.ts');
delete mocks['@/components/Sidebar'];
actor.displayName='Демо сотрудник';
actor.defaultBranchName='Демонстрационная среда';
mocks['@/app/login/LogoutForm']={LogoutForm:({children})=>React.createElement('form',null,children)};
const keys=new Set(['LEAD_VIEW','LEAD_CREATE','LEAD_EDIT','LEAD_ASSIGN','LEAD_CLOSE','LEAD_CONVERT_TO_ORDER','ORDER_VIEW','ORDER_CREATE','ORDER_EXPORT','PAYMENT_VIEW','SALE_CONFIRM','CUSTOMER_VIEW','CUSTOMER_CREATE','CATALOG_VIEW','CATALOG_CREATE','CATALOG_EDIT','FITTING_MANAGE','SETTINGS_VIEW','STAFF_VIEW','DOCUMENT_TEMPLATE_VIEW','DOCUMENT_SETTINGS_VIEW','STAFF_PERMISSION_MANAGE','TASK_VIEW','TASK_VIEW_ALL','TASK_MANAGE','SHIFT_VIEW','INVENTORY_VIEW']);
mocks['@/lib/permissions/effective']={hasPermission:async(_,key)=>keys.has(key),requirePermission:async()=>{},getEffectivePermissions:async()=>keys};
mocks['@/lib/inquiries/service'].inquiryOptions=async()=>({assignees:[{id:actor.membershipId,name:'Демо сотрудник'}],variants:[]});
delete mocks['@/components/ConversionForm'];
mocks['@/app/workspace/actions'].convertToRentalOrderAction=()=>{throw Error('Mutation prohibited')};
mocks['@/lib/workspace/conversion'].workflowOptions=async()=>({branch,customers:[],members:[{id:actor.membershipId,name:'Демо сотрудник'}]});
const order={id:'order-demo',orderNumber:'DEMO-001',type:'RENTAL',status:'DRAFT',customer:{firstName:'Демо',lastName:'Клиент',contacts:[]},branch,totalMinor:12000n,currency:'KZT',createdAt:new Date('2026-10-21T04:28:00Z'),rentalStartAt:new Date('2026-10-23T05:00:00Z'),rentalEndAt:new Date('2026-10-24T10:00:00Z'),assignedTo:null,_count:{items:1}};
mocks['@/lib/orders/workspace']={listOrdersWorkspace:async()=>({rows:[order],page:1,pages:1,total:1}),workspaceAssignees:async()=>[]};
mocks['@/lib/orders/queries']={getOrderFormOptions:async()=>({branches:[],customers:[]}),getOrders:async()=>[{...order,type:'SALE'}]};
mocks['@/lib/finance/queries']={getOrderPaymentListDetails:async()=>new Map()};
mocks['@/lib/customers/queries']={getCustomers:async()=>({rows:[{id:'customer-demo',customerNumber:'DEMO-C01',firstName:'Демонстрационный',lastName:'Клиент',contacts:[],source:'WEBSITE',status:'ACTIVE',createdAt:order.createdAt}],total:1,page:1,pageCount:1})};
mocks['@/lib/tasks/service']={listTasks:async()=>({rows:[{id:'task-demo',title:'Уточнить время примерки',status:'OPEN',branch,assignedTo:{user:{displayName:'Демо сотрудник'}},dueAt:new Date('2026-10-22T05:00:00Z')}],page:1,more:false}),canManageTasks:async()=>true,TASK_STATUSES:{OPEN:'Открыта',IN_PROGRESS:'В работе',DONE:'Выполнена',CANCELLED:'Отменена'}};
mocks['@/lib/staff/shifts']={shiftOptions:async()=>({canManage:true,branch:{...branch,id:'branch-a'},branches:[{...branch,id:'branch-a'}]}),listShifts:async()=>({rows:[{id:'shift-demo',assignedTo:{user:{displayName:'Демо сотрудник'}},startsAt:new Date('2026-10-22T05:00:00Z'),endsAt:new Date('2026-10-22T13:00:00Z'),status:'PLANNED'}],page:1,more:false,period:{fromLabel:'2026-10-21',untilLabel:'2026-10-27'}})};
mocks['@/lib/catalog/access']={getCatalogReadScope:async()=>['branch-a']};
mocks['@/lib/catalog/queries']={getCatalogProductsCount:async()=>1,getCatalogCategories:async()=>[],getCatalogProducts:async()=>[{id:'product-demo',name:'Демонстрационное платье',internalCode:'DEMO-01',color:'Розовый',trackingMode:'BULK',totalStock:3,variantGroups:[],rentalPrice:{amountMinor:12000n,currency:'KZT'},publicationStatus:'ACTIVE'}]};
mocks['@/components/OperationalItemSelector']={OperationalItemSelector:({triggerLabel})=>React.createElement('button',{type:'button',className:'secondary'},triggerLabel)};
mocks['@/lib/finance/cash']={cashOptions:async()=>({canCreate:true,canReverse:false,branches:[],methods:[],orders:[]}),cashMovements:async()=>({canView:true,rows:[],page:1,more:false,period:{fromLabel:'2026-10-01',untilLabel:'2026-10-21'}}),CASH_KIND_LABELS:{PAYMENT:'Оплата'}};
mocks['@/app/cash/actions']={acceptCashPaymentAction:()=>{throw Error('Mutation prohibited')}};
mocks['@/lib/stocktake/queries']={listStocktakes:async()=>[]};
mocks['@/lib/settings-business']={getBusinessSettings:async()=>({organization:{name:'MARIPOSA · демо',timezone:'Asia/Almaty',defaultCurrency:'KZT'},settings:{turnaroundBufferMinutes:0},canManageGlobal:false,branches:[],paymentMethods:[]})};
mocks['@/app/settings/business/actions']={saveBusinessSettingAction:()=>{throw Error('Mutation prohibited')}};
// Relative business actions also resolved through absolute path by this narrowly scoped hook.
const fixtureLoad=Module._load;Module._load=function(name,parent,...rest){if(name==='./actions'&&parent?.filename.includes('settings'+path.sep+'business'))return mocks['@/app/settings/business/actions'];return fixtureLoad.call(this,name,parent,...rest)};
const cases=['detail','detail-assigned','detail-overdue','detail-converted','detail-disabled'].map(name=>[name,'app/chats/[id]/page.tsx']);
(async()=>{try{
 fixtures=[base];reset('OWNER');
if(process.env.PURCHASE_RECORD_FILE){const notices=await staffNotifications(actor);const row=notices.sections.find(s=>s.key==='inquiries').rows.find(r=>r.id===base.id);assert.equal(row.label,routeRow.subject);assert.equal(row.overdue,false);}
 const cssFiles=[...fs.readFileSync(path.join(root,'app/layout.tsx'),'utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(m=>'app/'+m[1]);
 cssFiles.push('app/orders/workspace.css','app/chats/chats.css','app/cash/cash.css','app/cash/accounts/cash-accounts.css','app/crm-clarity.css');
 const css=cssFiles.map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
 const clientScript=require('esbuild').buildSync({stdin:{contents:`import React from 'react';import{hydrateRoot}from'react-dom/client';import{RevealSectionLink}from'./components/RevealSectionLink';for(const el of document.querySelectorAll('[data-reveal-fixture]')){hydrateRoot(el,React.createElement(RevealSectionLink,{target:el.dataset.revealFixture},el.textContent));}window.__clarityHydrated=true;`,resolveDir:root,loader:'tsx'},bundle:true,write:false,jsx:'automatic',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
 const results=[];
 for(const [name,file]of cases){
  keys.add('LEAD_EDIT');keys.add('LEAD_ASSIGN');
  Object.assign(routeRow,{status:'NEW',assignedMembershipId:null,assignedTo:null,nextAction:null,nextActionAt:null,orderId:null});
  if(name==='detail-assigned'||name==='detail-overdue')Object.assign(routeRow,{status:'IN_PROGRESS',assignedMembershipId:actor.membershipId,assignedTo:{status:'ACTIVE',user:{displayName:'Анна · демо'}},nextAction:'Уточнить время примерки',nextActionAt:new Date(name==='detail-overdue'?'2020-01-01T05:00:00Z':'2099-01-01T05:00:00Z')});
  if(name==='detail-converted')Object.assign(routeRow,{status:'ORDER',orderId:'demo-order'});
  if(name==='detail-disabled'){keys.delete('LEAD_EDIT');keys.delete('LEAD_ASSIGN');}
  const Page=require(path.join(root,file)).default;
  const html=renderToStaticMarkup(await resolveTree(React.createElement(Page,{params:Promise.resolve({id:base.id}),searchParams:Promise.resolve({})})));
  if(process.env.INTEGRATION_CONVERSATION)assert(html.includes('INTEGRATION_USER:')&&html.includes('INTEGRATION_ASSISTANT:')&&html.includes('Переданная переписка')&&html.includes('История доступна до'));
  if(name==='detail'){assert(html.includes('Взять в работу'));assert(html.includes('Проверить наличие'));assert(html.includes(process.env.PURCHASE_RECORD_FILE?'Оформить продажу':'Оформить заказ'));assert(html.includes('name="version"'));assert(!html.includes('name="replyContact" value=""'));}
  if(process.env.PURCHASE_RECORD_FILE){assert(!html.includes('Создать заказ аренды'));assert(html.includes('Покупка · без дат аренды'));assert(html.includes('3200000'));assert(html.includes('Заявка на покупку с сайта'));if(name!=='detail-converted')assert(html.includes('href="/sales/new"'));}
  if(name==='detail-overdue')assert(html.includes('Просрочено:')&&html.includes('Уточнить время примерки'));
  if(name==='detail-assigned')assert(html.includes('Анна · демо')&&html.includes('Следующий шаг:'));
  if(name==='detail-converted')assert(html.includes('href="/orders/demo-order"')&&!html.includes('Заявка, ещё не бронь.'));
  if(name==='detail-disabled')assert(html.includes('disabled=""')&&html.includes('Недостаточно прав для назначения.'));
  fs.writeFileSync(path.join(out,name+'.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body>'+html+'<script>'+clientScript+'</script></body></html>');results.push({name,file,rendered:true});
 }
 // Read-only and already assigned inquiries must not expose the one-click claim.
 keys.delete('LEAD_ASSIGN');let Page=require(path.join(root,'app/chats/[id]/page.tsx')).default;
 let html=renderToStaticMarkup(await resolveTree(React.createElement(Page,{params:Promise.resolve({id:base.id}),searchParams:Promise.resolve({})})));assert(!html.includes('class="inquiry-claim"'));
 keys.add('LEAD_ASSIGN');routeRow.assignedMembershipId='another';
 html=renderToStaticMarkup(await resolveTree(React.createElement(Page,{params:Promise.resolve({id:base.id}),searchParams:Promise.resolve({})})));assert(!html.includes('class="inquiry-claim"'));
 if(process.env.PURCHASE_RECORD_FILE){keys.delete('SALE_CONFIRM');html=renderToStaticMarkup(await resolveTree(React.createElement(Page,{params:Promise.resolve({id:base.id}),searchParams:Promise.resolve({})})));assert(!html.includes('href="/sales/new"'));assert(!html.includes('Создать заказ аренды'));}
 fs.writeFileSync(path.join(out,'fixtures.json'),JSON.stringify({actualRouteJsx:true,syntheticDataOnly:true,liveWrites:0,claimGuards:'permission and existing assignee PASS',results},null,2));console.log('PASS actual route JSX fixtures: '+results.length+'; claim guards');
}finally{Module._load=originalLoad;Module._resolveFilename=originalResolve}})().catch(e=>{console.error(e);process.exitCode=1});
