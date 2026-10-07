// Isolated DB test: requires an explicit synthetic manifest, never loads .env.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const app=path.resolve(__dirname,'..'),root=path.resolve(app,'..'),out=path.join(root,'p1-permissions-evidence'),manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json')));
assert(manifest.syntheticOnly&&/^crm_p1_permissions_\d+$/.test(manifest.database));
require('tsx/cjs');const{PrismaClient}=require('../generated/prisma/client.ts'),{PrismaPg}=require('@prisma/adapter-pg'),ts=require('typescript'),React=require('react');
let currentActor=null;
const db=new PrismaClient({adapter:new PrismaPg({host:'127.0.0.1',port:62317,user:'import_test',database:manifest.database})}),cache=new Map(),tests=[];
function load(file){if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);const code=ts.transpileModule(fs.readFileSync(path.join(app,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{console,Date,BigInt,Buffer,Intl,Map,Set,URL,URLSearchParams,Response,Request,FormData})(name=>{if(name==='server-only')return{};if(name==='@/lib/auth/session')return{getCurrentSession:async()=>currentActor,requireRouteAccess:async()=>{if(!currentActor)throw Error("No session");return currentActor}};if(name==='next/navigation')return{redirect:url=>{const e=Error('Redirect');e.redirect=url;throw e},unstable_rethrow:e=>{if(e.redirect)throw e}};if(name==='next/cache')return{revalidatePath:()=>{}};if(name==='@/lib/db')return{db};if(name==='react')return{...React,cache:f=>f};if(name==='@/generated/prisma/client')return require('../generated/prisma/client.ts');if(name.startsWith('node:')||name==='zod')return require(name);if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.posix.join(path.posix.dirname(file),name)+'.ts');throw Error('Unexpected '+name)},m,m.exports);return m.exports}
async function test(name,fn){await fn();tests.push(name);console.log('PASS '+name)}
(async()=>{try{
 const org='e376414e-4e0b-5048-8a62-eda3988bea4a',branch='02debaff-e940-5380-bafe-b4067864b7fb',other='6072e880-f1ae-4dc3-b99a-3979d54dbb0c',id=()=>crypto.randomUUID(),tag='ACL-'+id(),tenant={organizationId:org};
 assert.equal(await db.organization.count({where:{id:'2157bde1-1994-465b-9f80-e1b740ee3cb1'}}),0);
 const actors=Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root,'crm-local-acceptance/manifest.json'))).actors.map(a=>[a.role.toLowerCase(),{...a,organizationId:org,defaultBranchId:branch}])),owner=actors.owner;
 const registry=load('lib/permissions/registry.ts'),engine=load('lib/permissions/member.ts'),effective=load('lib/permissions/effective.ts'),roles=load('lib/permissions/roles.ts'),workflow=load('lib/workflow-access.ts');
 const allKeys=Object.keys(registry.PERMISSION_REGISTRY);
 async function fresh(actor){return db.organizationMembership.findUniqueOrThrow({where:{id:actor.membershipId},select:engine.permissionMemberSelect})}
 async function createActor(label,baseRole='SELLER',branchId=branch){const user=await db.user.create({data:{email:(tag+'-'+label+'@example.test').toLowerCase(),displayName:'ACL '+label,passwordHash:'SYNTHETIC_NOT_A_LOGIN_HASH',status:'ACTIVE'}}),m=await db.organizationMembership.create({data:{organizationId:org,userId:user.id,role:baseRole,status:'ACTIVE',defaultBranchId:branchId}});await db.membershipBranchAccess.create({data:{organizationId:org,membershipId:m.id,branchId}});return{...owner,userId:user.id,membershipId:m.id,role:baseRole,displayName:user.displayName,defaultBranchId:branchId,allowedBranchIds:[branchId],hasOrganizationWideBranchAccess:false}}
 const worker=await createActor('worker'),manager=await createActor('administrator'),target=await createActor('target','CASHIER'),outsider=await createActor('otherbranch','SELLER',other);
 let workerRole,managerRole,version;
 async function changeWorker(keys){const r=await db.permissionRole.findUniqueOrThrow({where:{id:workerRole}});await roles.savePermissionRole(owner,{id:r.id,version:r.version,name:r.name,permissionKeys:keys});}
 await test('migration templates retain existing effective defaults and auto-attach new members',async()=>{
  for(const actor of Object.values(actors)){const member=await fresh(actor);for(const key of allKeys.filter(key=>!key.startsWith('PAYROLL_')&&!['TASK_VIEW_ALL','SHIFT_VIEW_ALL','NOTIFICATIONS_VIEW_ALL','SETTINGS_GLOBAL_MANAGE','DOCUMENT_SETTINGS_VIEW','DOCUMENT_SETTINGS_MANAGE'].includes(key))){const override=member.permissionOverrides.find(x=>x.permissionKey===key);assert.equal(engine.memberHasPermission(member,key),member.role==='OWNER'||(override?override.effect==='ALLOW':registry.defaultHasPermission(member.role,key)),key)}}
  assert((await fresh(worker)).permissionRole);assert.equal(await db.permissionRole.count({where:{organizationId:org}}),3);
 });
 await test('named bundle OFF/ON governs every registered server permission independent of SELLER base role',async()=>{
  workerRole=await roles.savePermissionRole(owner,{name:tag+' Worker',permissionKeys:[]});const before=await db.organizationMembership.findUniqueOrThrow({where:{id:worker.membershipId}});await roles.assignPermissionRole(owner,worker.membershipId,workerRole,before.permissionRoleId);
  for(const key of allKeys)await assert.rejects(db.$transaction(tx=>workflow.workflowScope(tx,worker,[key],branch)),/Недостаточно/);
  await changeWorker(allKeys);for(const key of allKeys)await db.$transaction(tx=>workflow.workflowScope(tx,worker,[key],branch));
  const permissions=await effective.getEffectivePermissions(worker);assert.equal(permissions.size,allKeys.length);assert(load('lib/auth/access.ts').canAccessRoute(worker.role,'/finance',permissions));assert(load('lib/auth/access.ts').canAccessRoute(worker.role,'/products',permissions));
  await assert.rejects(db.$transaction(tx=>workflow.workflowScope(tx,worker,['PAYMENT_REFUND'],other)),/Филиал/);
 });
 await test('individual DENY and reset have priority over the role without widening branch access',async()=>{
  await roles.changeIndividualPermission(owner,worker.membershipId,'PAYMENT_REFUND','DENY');assert.equal(await effective.hasPermission(worker,'PAYMENT_REFUND'),false);
  await roles.changeIndividualPermission(owner,worker.membershipId,'PAYMENT_REFUND',null);assert.equal(await effective.hasPermission(worker,'PAYMENT_REFUND'),true);
  await changeWorker([]);await roles.changeIndividualPermission(owner,worker.membershipId,'PAYMENT_REFUND','ALLOW');assert.equal(await effective.hasPermission(worker,'PAYMENT_REFUND'),true);assert.equal(await effective.hasPermission(worker,'DEPOSIT_REFUND'),false);await roles.changeIndividualPermission(owner,worker.membershipId,'PAYMENT_REFUND',null);
 });
 await test('permission management rejects self-escalation, owner edits, foreign scopes and delegation above ceiling',async()=>{
  managerRole=await roles.savePermissionRole(owner,{name:tag+' Administrator',permissionKeys:['STAFF_VIEW','STAFF_PERMISSION_MANAGE','CUSTOMER_VIEW','ORDER_VIEW','PAYMENT_REFUND']});const m=await db.organizationMembership.findUniqueOrThrow({where:{id:manager.membershipId}});await roles.assignPermissionRole(owner,manager.membershipId,managerRole,m.permissionRoleId);
  await assert.rejects(roles.changeIndividualPermission(manager,manager.membershipId,'DEPOSIT_REFUND','ALLOW'),/собственный/);
  await assert.rejects(roles.savePermissionRole(manager,{id:managerRole,version:1,name:tag+' Own',permissionKeys:[]}),/собственный/);
  await assert.rejects(roles.changeIndividualPermission(manager,owner.membershipId,'ORDER_VIEW','DENY'),/Владение/);
  await assert.rejects(roles.changeIndividualPermission(manager,outsider.membershipId,'ORDER_VIEW','ALLOW'),/филиалов/);
  await assert.rejects(roles.savePermissionRole(manager,{name:tag+' Escalation',permissionKeys:['DEPOSIT_REFUND']}),/выше/);
  await assert.rejects(roles.savePermissionRole(manager,{name:tag+' Admin escalation',permissionKeys:['STAFF_PERMISSION_MANAGE']}),/выше/);
  const limited=await roles.savePermissionRole(manager,{name:tag+' Refund only',permissionKeys:['ORDER_VIEW','PAYMENT_REFUND']});const targetRow=await db.organizationMembership.findUniqueOrThrow({where:{id:target.membershipId}});await roles.assignPermissionRole(manager,target.membershipId,limited,targetRow.permissionRoleId);assert.equal(await effective.hasPermission(target,'PAYMENT_REFUND'),true);
  await roles.changeIndividualPermission(manager,target.membershipId,'PAYMENT_REFUND','DENY');assert.equal(await effective.hasPermission(target,'PAYMENT_REFUND'),false);
 });
 await test('optimistic version prevents overwrite; role edits and assignments revoke sessions and audit exact changes',async()=>{
  const session=await db.authSession.create({data:{organizationId:org,userId:worker.userId,membershipId:worker.membershipId,tokenHash:crypto.randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+3600000)}});
  const r=await db.permissionRole.findUniqueOrThrow({where:{id:workerRole}});version=r.version;await roles.savePermissionRole(owner,{id:r.id,version,name:r.name,permissionKeys:['ORDER_VIEW']});await assert.rejects(roles.savePermissionRole(owner,{id:r.id,version,name:r.name,permissionKeys:[]}),/уже изменён/);
  assert((await db.authSession.findUniqueOrThrow({where:{id:session.id}})).revokedAt);await db.authSession.delete({where:{id:session.id}});
  const audit=await db.auditLog.findFirst({where:{organizationId:org,entityId:r.id,action:'STAFF_PERMISSION_CHANGED'},orderBy:{occurredAt:'desc'}});assert(audit.metadata.permissionKey);assert(['ALLOW','DENY'].includes(audit.metadata.effect));
  await assert.rejects(roles.assignPermissionRole(owner,target.membershipId,r.id,null),/уже изменено/);
 });
 const customer=await db.customer.create({data:{organizationId:org,customerNumber:tag,firstName:'ACL synthetic customer'}}),method=await db.paymentMethod.upsert({where:{organizationId_code:{organizationId:org,code:'CASH'}},create:{organizationId:org,code:'CASH',displayName:'Synthetic Cash'},update:{}});
 const order=await db.order.create({data:{organizationId:org,branchId:branch,customerId:customer.id,orderNumber:tag,type:'RENTAL',status:'CONFIRMED',channel:'CRM',currency:'KZT',totalMinor:1000n,depositRequiredMinor:100n,createdByUserId:owner.userId}});
 const payments=load('lib/finance/order-payments.ts'),deposits=load('lib/finance/order-deposits.ts');let payment;
 await test('real payment acceptance and partial refund follow checkboxes; over-refund and other finance operations stay denied',async()=>{
  const input={orderId:order.id,amountMinor:200n,paymentMethodId:method.id,idempotencyKey:id()};await assert.rejects(payments.acceptOrderPayment(tenant,input,worker),/прав/);
  await changeWorker(['ORDER_VIEW','PAYMENT_CREATE']);payment=await payments.acceptOrderPayment(tenant,input,worker);assert.equal(payment.amountMinor,200n);
  const refund={orderId:order.id,paymentId:payment.id,amountMinor:50n,reason:'Synthetic partial refund',idempotencyKey:id()};await assert.rejects(payments.refundOrderPayment(tenant,refund,worker),/прав/);
  await changeWorker(['ORDER_VIEW','PAYMENT_REFUND']);const result=await payments.refundOrderPayment(tenant,refund,worker);assert.equal(result.amountMinor,50n);assert.equal(result.relatedTransactionId,payment.id);
  await assert.rejects(payments.refundOrderPayment(tenant,{...refund,amountMinor:151n,idempotencyKey:id()},worker));assert.equal(await effective.hasPermission(worker,'DEPOSIT_WITHHOLD'),false);
 });
 await test('real deposit refund can be granted separately and retains remaining-deposit invariants',async()=>{
  await deposits.receiveOrderDeposit(tenant,{orderId:order.id,amountMinor:100n,paymentMethodId:method.id,idempotencyKey:id()},owner);
  const input={orderId:order.id,amountMinor:40n,reason:'Synthetic deposit return',confirmed:true,idempotencyKey:id()};await assert.rejects(deposits.refundOrderDeposit(tenant,input,worker),/прав/);
  await changeWorker(['ORDER_VIEW','DEPOSIT_REFUND']);const result=await deposits.refundOrderDeposit(tenant,input,worker);assert.equal(result.reduce((n,r)=>n+r.amountMinor,0n),40n);assert.equal(await effective.hasPermission(worker,'PAYMENT_REFUND'),false);await assert.rejects(deposits.refundOrderDeposit(tenant,{...input,amountMinor:61n,idempotencyKey:id()},worker),/превышает/);
 });
 await test('real warehouse receipt is denied OFF and succeeds ON; custom role still cannot use another branch',async()=>{
  const variant=await db.productVariant.findFirstOrThrow({where:{organizationId:org,product:{trackingMode:'BULK'}}}),location=await db.location.findFirstOrThrow({where:{organizationId:org,branchId:branch,isActive:true}}),inventory=load('lib/inventory/management.ts');const input={variantId:variant.id,branchId:branch,locationId:location.id,quantity:1,idempotencyKey:id()};
  await assert.rejects(inventory.receiveBulk(tenant,input,worker),/прав/);await changeWorker(['INVENTORY_VIEW','INVENTORY_RECEIVE']);const result=await inventory.receiveBulk(tenant,input,worker);assert.equal(result.type,'RECEIPT');assert.equal(result.quantity,1);await assert.rejects(inventory.receiveBulk(tenant,{...input,branchId:other,idempotencyKey:id()},worker),/Филиал/);
 });
 await test('tenant foreign key, non-owner management entry points, and stale owner context fail closed',async()=>{
  const foreign=await db.organization.create({data:{name:tag+' Foreign',slug:(tag+'-foreign').toLowerCase()}}),role=await db.permissionRole.findFirstOrThrow({where:{organizationId:foreign.id}});await assert.rejects(db.organizationMembership.update({where:{id:worker.membershipId},data:{permissionRoleId:role.id}}));
  await assert.rejects(roles.assignPermissionRole(owner,worker.membershipId,role.id,workerRole),/не найден/);
  const management=load('lib/staff/management.ts');await assert.rejects(management.changeStaffRole(tenant,target.membershipId,'OWNER',manager),/Владение/);await assert.rejects(management.setBranchAccess(tenant,target.membershipId,{branchIds:[other],defaultBranchId:other},manager),/прав|филиал/);
  assert.equal(await effective.hasPermission({...worker,role:'OWNER'},'STAFF_PERMISSION_MANAGE'),false);
  await db.organizationMembership.update({where:{id:worker.membershipId},data:{status:'SUSPENDED'}});assert.equal((await effective.getEffectivePermissions({...worker,role:'OWNER'})).size,0);await db.organizationMembership.update({where:{id:worker.membershipId},data:{status:'ACTIVE'}});
 });
 // Leave useful, minimal synthetic actors for the separate browser flow.
 await changeWorker(['ORDER_VIEW','CUSTOMER_VIEW','CATALOG_VIEW','INVENTORY_VIEW']);
 fs.writeFileSync(path.join(out,'fixture.json'),JSON.stringify({actors:{owner,worker,manager,target},org,branch,other,workerRole,managerRole,orderId:order.id,customerId:customer.id},null,2));
 fs.writeFileSync(path.join(out,'service-result.json'),JSON.stringify({status:'PASS',tests,registeredPermissions:allKeys.length,database:manifest.database,syntheticOnly:true},null,2));
}finally{await db.$disconnect()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
