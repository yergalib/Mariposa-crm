// Real notification projection; scoped permission/DB boundaries supplied in memory.
// No credentials, external clients, database or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let permissions, branchIds, calls, scopeReads;
const actor = {organizationId:'org', membershipId:'manager', userId:'user'};
const branches = {inside:{name:'Inside',timezone:'UTC'}, outside:{name:'Outside',timezone:'UTC'}};
const fixtures = [
  {id:'visible',organizationId:'org',branchId:'inside',employeeMembershipId:'employee',status:'SUBMITTED',workDate:new Date('2026-10-06'),employee:{user:{displayName:'Employee'}},branch:branches.inside},
  {id:'processed',organizationId:'org',branchId:'inside',status:'APPROVED',workDate:new Date('2026-10-06'),employee:{user:{displayName:'Processed'}},branch:branches.inside},
  {id:'other-branch',organizationId:'org',branchId:'outside',status:'SUBMITTED',workDate:new Date('2026-10-06'),employee:{user:{displayName:'Outside employee'}},branch:branches.outside},
  {id:'foreign',organizationId:'foreign',branchId:'inside',status:'SUBMITTED',workDate:new Date('2026-10-06'),employee:{user:{displayName:'Foreign employee'}},branch:branches.inside}
];
function reset(keys, scope=['inside']) {permissions=new Set(keys);branchIds=scope;calls=[];scopeReads=0;}
const db = {$transaction:fn=>fn({}),payrollClaim:{findMany:async query=>{
  calls.push(query);
  assert.equal(query.where.organizationId,'org');
  assert.equal(query.where.status,'SUBMITTED');
  assert.equal(query.where.branch.organizationId,'org');
  assert.equal(query.where.branch.status,'ACTIVE');
  assert(query.take<=101);
  assert(!('approvalSnapshot' in query.select));
  return fixtures.filter(row=>row.organizationId===query.where.organizationId&&row.status===query.where.status&&(!query.where.branchId||query.where.branchId.in.includes(row.branchId)));
}}};
const imports = {
  'server-only':{},
  '@/lib/db':{db},
  '@/lib/permissions/member':{memberPermissions:()=>permissions},
  '@/lib/auth/access':{canAccessRoute:()=>true},
  '@/lib/workflow-access':{
    workflowScope:async()=>{scopeReads++;return {member:{role:'DIRECTOR'},where:{organizationId:actor.organizationId,...(branchIds===null?{}:{branchId:{in:branchIds}})}}},
    permits:(_member,key)=>permissions.has(key)
  }
};
const source=fs.readFileSync(path.join(root,'lib/staff/notifications.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleRecord={exports:{}};
vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Date,Error})(name=>{assert(Object.hasOwn(imports,name),name);return imports[name]},moduleRecord,moduleRecord.exports);
const {staffNotifications}=moduleRecord.exports;
(async()=>{
  reset(['PAYROLL_VIEW','PAYROLL_CONFIRM']);
  const result=await staffNotifications(actor,new Date('2026-10-08'));
  const payroll=result.sections.find(section=>section.key==='payroll');
  assert.equal(payroll.rows.length,1);
  assert.equal(payroll.rows[0].id,'visible');
  assert.equal(payroll.rows[0].href,'/payroll?branchId=inside&employeeMembershipId=employee');
  assert.equal(scopeReads,1);
  for(const keys of [[],['PAYROLL_VIEW'],['PAYROLL_CONFIRM']]){
    reset(keys);const denied=await staffNotifications(actor);
    assert.equal(calls.length,0);
    assert.equal(denied.sections.some(section=>section.key==='payroll'),false);
  }
  reset(['PAYROLL_VIEW','PAYROLL_CONFIRM'],[]);
  assert.equal((await staffNotifications(actor)).sections[0].rows.length,0);
  reset(['PAYROLL_VIEW','PAYROLL_CONFIRM'],null);
  assert.equal((await staffNotifications(actor)).sections[0].rows.length,2);
  permissions.delete('PAYROLL_CONFIRM');
  assert.equal((await staffNotifications(actor)).sections.length,0);
  assert.equal(scopeReads,2);
  console.log('PASS pending payroll queue: both permissions, current branch/tenant scope, processed exclusion, contextual link, fresh scope and no financial projection');
})().catch(error=>{console.error(error);process.exitCode=1});
