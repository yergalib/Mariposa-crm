// Real notification/access code and actual route JSX; synthetic read boundaries only.
// No database, network, live sessions or model calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const out=path.resolve(process.env.INQUIRY_EVIDENCE_DIR||path.join(root,'inquiry-visibility-evidence'));fs.mkdirSync(out,{recursive:true});
const actor={organizationId:'org-a',membershipId:'owner-a',userId:'user-a',role:'OWNER',defaultBranchId:'branch-a'};
let member,reads=0,scopeReads=0;
const branch={name:'MARIPOSA · демофилиал',timezone:'Asia/Almaty',organizationId:'org-a',status:'ACTIVE'};
const base={id:'10000000-0000-4000-8000-000000000001',organizationId:'org-a',branchId:'branch-a',status:'NEW',subject:'Заявка с сайта: демонстрационное платье',source:'WEBSITE',createdAt:new Date('2026-10-21T04:28:01.457Z'),nextAction:null,nextActionAt:null,assignedMembershipId:null,assignedTo:null,branch};
let fixtures=[base,{...base,id:'assigned',assignedMembershipId:'someone-else'},{...base,id:'foreign',organizationId:'org-b'},{...base,id:'other-branch',branchId:'branch-b'},{...base,id:'inactive-branch',branch:{...branch,status:'INACTIVE'}},{...base,id:'processed',status:'IN_PROGRESS'}];
function reset(role='SELLER',keys=['LEAD_VIEW']){member={role,permissionRole:{permissionKeys:keys},permissionOverrides:[],branchAccess:[{branchId:'branch-a'}],active:true};reads=0;scopeReads=0;}
const empty={findMany:async()=>[]};
const db={$transaction:fn=>fn(db),organizationMembership:{findFirst:async q=>{scopeReads++;assert.equal(q.where.organizationId,actor.organizationId);assert.equal(q.where.userId,actor.userId);assert.equal(q.where.id,actor.membershipId);assert.equal(q.where.status,'ACTIVE');assert.equal(q.where.user.status,'ACTIVE');return member.active?member:null}},inquiry:{findMany:async q=>{reads++;const w=q.where;assert.equal(w.organizationId,actor.organizationId);assert.equal(w.branch.organizationId,actor.organizationId);assert.equal(w.branch.status,'ACTIVE');assert.equal(w.status,'NEW');assert(!('assignedMembershipId' in w));assert(q.take<=101);assert.deepEqual(Object.keys(q.select).sort(),['branch','createdAt','id','subject']);return fixtures.filter(r=>r.organizationId===w.organizationId&&r.status===w.status&&r.branch.status===w.branch.status&&r.branch.organizationId===w.branch.organizationId&&(!w.branchId||w.branchId.in.includes(r.branchId))).slice(0,q.take)}},staffTask:empty,fitting:empty,order:empty,payrollClaim:empty};
const routeRow={...base,customerLabel:'Демонстрационный клиент',replyContact:'client@example.com',requestText:'Хочет уточнить примерку.',requestedFrom:new Date('2026-10-23T05:00:00Z'),requestedUntil:new Date('2026-10-24T10:00:00Z'),requestedSize:'104–110',version:1,orderId:null,items:[{id:'item',productVariantId:'variant',nameSnapshot:'Демонстрационное платье',sizeSnapshot:'104–110',skuSnapshot:'DEMO-01'}]};
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
 '@/lib/assistant/history/service':{inquiryConversation:async()=>null},
 '@/app/workspace/actions':{updateInquirySelectionAction:()=>{throw Error('Mutation prohibited')}},
 '@/components/ConversionForm':{ConversionForm:()=>{throw Error('Unauthorized conversion rendered')}},
 '@/lib/workspace/conversion':{workflowOptions:()=>{throw Error('Unexpected conversion read')}},
};
Module._resolveFilename=function(name,parent,...rest){if(name.startsWith('@/'))name=path.join(root,name.slice(2));return originalResolve.call(this,name,parent,...rest)};
Module._load=function(name,parent,...rest){if(Object.hasOwn(mocks,name))return mocks[name];if(name==='./Sidebar'&&parent?.filename.endsWith('AppShell.tsx'))return mocks['@/components/Sidebar'];if(name==='../InquiryForm')return {InquiryForm:()=>null};if(name.endsWith('.css'))return {};return originalLoad.call(this,name,parent,...rest)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const {staffNotifications}=require('../lib/staff/notifications.ts');
async function resolveTree(node){node=await node;if(Array.isArray(node))return Promise.all(node.map(async(child,index)=>{const resolved=await resolveTree(child);return React.isValidElement(resolved)?React.cloneElement(resolved,{key:resolved.key??index}):resolved}));if(!React.isValidElement(node))return node;if(typeof node.type==='function')return resolveTree(node.type(node.props));return React.cloneElement(node,{},await resolveTree(node.props.children))}
const tests=[];
(async()=>{try{
 reset();let data=await staffNotifications(actor);let q=data.sections.find(s=>s.key==='inquiries');assert.deepEqual(q.rows.map(r=>r.id),[base.id,'assigned']);assert.equal(q.rows[0].overdue,false);assert.equal(q.rows[0].href,'/chats/'+base.id);assert.equal(new Set(q.rows.map(r=>r.id)).size,q.rows.length);assert.equal(scopeReads,1);tests.push('Unassigned and assigned NEW inquiries visible with LEAD_VIEW; foreign tenant, other branch, inactive branch, processed excluded; no duplicate notices or false overdue');
 member.permissionOverrides=[{permissionKey:'LEAD_VIEW',effect:'DENY'}];assert.equal((await staffNotifications(actor)).sections.length,0);assert.equal(reads,1);tests.push('Permission revocation rechecked; denied reader makes no inquiry query');
 reset();member.branchAccess=[];assert.equal((await staffNotifications(actor)).sections[0].rows.length,0);member.active=false;await assert.rejects(()=>staffNotifications(actor));tests.push('Empty branch scope and suspended membership fail closed');
 reset('OWNER');assert.equal((await staffNotifications(actor)).sections.find(s=>s.key==='inquiries').rows.length,3);tests.push('OWNER sees NEW unassigned requests across own active branches only');
 reset();base.status='IN_PROGRESS';assert(!(await staffNotifications(actor)).sections[0].rows.some(r=>r.id===base.id));base.status='NEW';tests.push('Status transition removes notice on next existing queue read');
 const saved=fixtures;fixtures=Array.from({length:102},(_,i)=>({...base,id:'limit-'+i}));q=(await staffNotifications(actor)).sections[0];assert.equal(q.rows.length,100);assert.equal(q.limited,true);fixtures=saved;tests.push('Queue remains bounded at 100 plus overflow indicator');
 fixtures=[base];reset('OWNER');const css=['app/globals.css','app/design-system.css','app/orders/workspace.css','app/chats/chats.css'].map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
 for(const [name,file,props] of [['list','app/chats/page.tsx',{searchParams:Promise.resolve({})}],['detail','app/chats/[id]/page.tsx',{params:Promise.resolve({id:base.id}),searchParams:Promise.resolve({})}],['notifications','app/notifications/page.tsx',{}]]){
  // Actual route and AppShell render; only external/auth/data boundaries and unrelated client chrome are fixtures.
  const Page=require(path.join(root,file)).default;const html=renderToStaticMarkup(await resolveTree(React.createElement(Page,props)));
  assert(html.includes('09:28'));assert(html.includes('Поступило'));assert(!html.includes('Asia/Almaty'));assert(html.includes('Уведомления: 1'));if(name!=='notifications'){assert(html.includes('Не назначен'));assert(html.includes('Следующий шаг'));assert(html.includes('Ожидает обработки'));}else{assert(html.includes('data-notice-kind="inquiries"'));assert(!html.includes('Срок наступил'));}
  assert(!html.includes('автоматически не поступают'));fs.writeFileSync(path.join(out,name+'.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body>'+html+'</body></html>');
 }
 tests.push('Actual list, detail and notifications routes render arrival in business timezone, status/help, empty work fields and AppShell count; no stale copy or timezone identifiers');
 fs.writeFileSync(path.join(out,'targeted.json'),JSON.stringify({status:'PASS',base:'c6924f2b7710c03a59232b5f9826e221b8f95046',syntheticOnly:true,liveWrites:0,tests},null,2));console.log(tests.map(t=>'PASS '+t).join('\n'));
}finally{Module._load=originalLoad;Module._resolveFilename=originalResolve}})().catch(e=>{console.error(e);process.exitCode=1});
