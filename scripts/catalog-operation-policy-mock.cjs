// Real policy/validators/order services; strict in-memory models only. No DB, network or env files.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto');
const org='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',executionId='33333333-3333-4333-8333-333333333333';
const tenant={organizationId:org},actor={membershipId:'m',userId:'u',role:'DIRECTOR'};
let order,rows,events,writes,capacityCalls,policyReads,financialCorrections;
const policyLockBatches=[];
function matches(row,where={}){return Object.entries(where).every(([key,value])=>{
  if(value===undefined)return true;if(key==='AND')return (Array.isArray(value)?value:[value]).every(w=>matches(row,w));
  if(key==='OR')return value.some(w=>matches(row,w));const actual=row?.[key];
  if(value===null||typeof value!=='object')return actual===value;
  if('in'in value)return value.in.includes(actual);if('not'in value)return actual!==value.not;
  return actual!=null&&matches(actual,value);
});}
const variant=(overrides={},execution=null)=>({id,organizationId:org,productId:'product',executionId:execution?.id??null,isActive:true,sku:'TEST',prices:[],
  product:{id:'product',organizationId:org,isRentable:true,isSellable:true,showOnWebsite:true,publicationStatus:'ACTIVE',archivedAt:null,name:'Synthetic',trackingMode:'BULK',
    directIsRentableOverride:null,directIsSellableOverride:null,directShowOnWebsiteOverride:null,...overrides},execution,size:{organizationId:org,isActive:true,name:'104',code:'104'}});
const exec=(overrides={})=>({id:executionId,organizationId:org,productId:'product',isActive:true,name:'Blue',isRentableOverride:null,isSellableOverride:null,showOnWebsiteOverride:null,...overrides});
const tx={
  order:{findFirst:async()=>order,findUniqueOrThrow:async()=>order,update:async q=>{writes.push(['order',q]);return order;}},
  orderItem:{findFirst:async()=>({id:'item',productVariantId:id,quantity:1,unitPriceMinor:100n,discountTotalMinor:0n}),findMany:async()=>[{unitPriceMinor:100n,quantity:1,discountTotalMinor:0n}],update:async q=>{writes.push(['item',q]);return q.data;},updateMany:async q=>writes.push(['items',q])},
  productVariant:{findFirst:async q=>rows.find(row=>matches(row,q.where))??null,findMany:async q=>{policyReads++;return rows.filter(row=>matches(row,q.where)).map(row=>({id:row.id}));}},
  orderEvent:{findFirst:async()=>events,create:async q=>writes.push(['event',q])},
  organizationMembership:{findFirst:async q=>({id:'m',role:'DIRECTOR',permissionOverrides:[{permissionKey:'SALE_CONFIRM',effect:'ALLOW'}].filter(row=>!q.select?.permissionOverrides?.where?.permissionKey||row.permissionKey===q.select.permissionOverrides.where.permissionKey)})},
  capacityAllocation:{count:async()=>0,findMany:async()=>[]},
  branch:{findFirst:async()=>({id:'branch'})},customer:{findFirst:async()=>({id:'customer'})},
  $queryRaw:async q=>{
    const sql=q.strings.join('?'),ids=q.values.flat();
    if(sql.includes('FROM public.product_variants')){policyLockBatches.push(ids.slice(1));return rows.filter(row=>row.organizationId===ids[0]&&ids.includes(row.id)).map(row=>({id:row.id,product_id:row.productId,execution_id:row.executionId,size_id:'size'}));}
    if(sql.includes('FROM public.products'))return [...new Set(rows.filter(row=>row.product.organizationId===ids[0]&&ids.includes(row.productId)).map(row=>row.productId))].map(id=>({id}));
    if(sql.includes('FROM public.product_executions'))return rows.filter(row=>row.execution&&row.execution.organizationId===ids[0]&&ids.includes(row.executionId)).map(row=>({id:row.executionId,product_id:row.execution.productId}));
    if(sql.includes('FROM public.sizes'))return [{id:'size'}];
    return [{id:'order'}];
  },$executeRaw:async()=>0,
};
const db={$transaction:async fn=>fn(tx)};
const sources=new Set(["lib/catalog/price-order.ts",'lib/orders/commercial-permissions.ts','lib/catalog/operation-policy.ts','lib/catalog/operation-policy-guard.ts','lib/catalog/validation.ts','lib/orders/management.ts','lib/orders/validation.ts','lib/orders/errors.ts','lib/catalog/labels.ts','lib/sales/lifecycle.ts','lib/sales/pricing.ts','lib/permissions/registry.ts','lib/sales/fulfillment-payment.ts']);
const stubs={
  'server-only':{},zod:require('zod'),'node:crypto':crypto,'@/lib/db':{db},'@/generated/prisma/client':{Prisma:{sql:(strings,...values)=>({strings,values}),join:values=>values}},
  '@/lib/availability/capacity':{reserveOrderItemsWithClient:async()=>{capacityCalls++;},getVariantAvailabilityWithClient:()=>{throw Error('unexpected capacity quote');},getPermanentFleetReductionAvailabilityWithClient:()=>{throw Error('unexpected fleet reduction');}},
  '@/lib/availability/errors':{InsufficientCapacityError:class extends Error{}},
  '@/lib/finance/order-payments':{synchronizeOrderChargeWithClient:async()=>{financialCorrections++;}},
  '@/lib/finance/order-lock':{lockOrderFinance:async()=>{}},'@/lib/orders/lifecycle-lock':{lockOrderLifecycle:async()=>{}},
  '@/lib/staff/branch-access':{requireUserBranchAccess:async()=>{}},'@/lib/inventory/capacity-lock':{},'@/lib/inventory/bulk-maintenance-state':{},'@/lib/audit/log':{},
};
const cache=new Map();function load(file){if(cache.has(file))return cache.get(file);assert.ok(sources.has(file),file);const record={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const req=name=>{if(name in stubs)return stubs[name];const f=name.startsWith('@/')?name.slice(2):name.startsWith('.')?path.posix.join(path.posix.dirname(file),name):null;assert.ok(f,name);return load(f+'.ts');};
  vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Date,console,BigInt,Buffer})(req,record,record.exports);cache.set(file,record.exports);return record.exports;}
const policy={...load('lib/catalog/operation-policy.ts'),...load('lib/catalog/operation-policy-guard.ts')},validation=load('lib/catalog/validation.ts'),rental=load('lib/orders/management.ts'),sale=load('lib/sales/lifecycle.ts');
function reset(status='DRAFT',type='RENTAL'){
  writes=[];capacityCalls=0;policyReads=0;financialCorrections=0;events=null;rows=[variant({directIsRentableOverride:false,directIsSellableOverride:false})];
  order={id:'order',organizationId:org,type,status,branchId:'branch',customerId:'customer',discountTotalMinor:0n,rentalStartAt:new Date('2026-10-06'),rentalEndAt:new Date('2026-10-07'),
    items:[{id:'item',productVariantId:id,quantity:1,productVariant:rows[0],capacityAllocations:[{quantity:1}]}]};
}
let passed=0;async function test(name,fn){reset();await fn();passed++;console.log('PASS '+name);}
async function main(){
  await test('NULL legacy, model hard gates and SQL parity for every flag combination in DIRECT and execution groups',()=>{
    let cases=0;
    for(const rent of [false,true])for(const sell of [false,true])for(const website of [false,true])
    for(const r of [null,false,true])for(const s of [null,false,true])for(const w of [null,false,true])for(const execution of [false,true]){
      const row=execution?variant({isRentable:rent,isSellable:sell,showOnWebsite:website},exec({isRentableOverride:r,isSellableOverride:s,showOnWebsiteOverride:w})):
        variant({isRentable:rent,isSellable:sell,showOnWebsite:website,directIsRentableOverride:r,directIsSellableOverride:s,directShowOnWebsiteOverride:w});
      const expected={isRentable:rent&&(r??true),isSellable:sell&&(s??true),showOnWebsite:website&&(w??true)};
      const result=policy.resolveOperationPolicy(row.product,row.executionId,row.execution);assert.equal(JSON.stringify(result),JSON.stringify(expected));
      for(const operation of ['RENTAL','SALE'])for(const published of [false,true])assert.equal(matches(row,policy.variantOperationWhere(org,operation,published)),expected[operation==='RENTAL'?'isRentable':'isSellable']&&(!published||expected.showOnWebsite));cases++;
    }
    assert.equal(cases,432);
  });
  await test('missing, foreign, inactive execution denies; DIRECT ignores any unrelated execution object',()=>{
    const product=variant().product;
    for(const execution of [null,exec({id:'wrong'}),exec({productId:'other'}),exec({organizationId:'foreign'}),exec({isActive:false})])assert.equal(Object.values(policy.resolveOperationPolicy(product,executionId,execution)).some(Boolean),false);
    assert.equal(policy.resolveOperationPolicy(product,null,exec({isRentableOverride:false})).isRentable,true);
    for(const row of [variant({organizationId:'foreign'}),{...variant(),organizationId:'foreign'},{...variant(),size:{organizationId:org,isActive:false}},variant({},exec({isActive:false})),variant({archivedAt:new Date()})])assert.equal(matches(row,policy.variantOperationWhere(org,'RENTAL')),false);
  });
  await test('DIRECT restriction remains independent of enabled color; search OR cannot overwrite policy',()=>{
    const direct=variant({directIsRentableOverride:false}),blue=variant({},exec());
    assert.equal(matches(direct,{...policy.variantOperationWhere(org,'RENTAL'),OR:[{id}]}),false);
    assert.equal(matches(blue,{...policy.variantOperationWhere(org,'RENTAL'),OR:[{id}]}),true);
  });
  await test('internal inventory accepted without publication; omitted overrides preserve existing values',()=>{
    const input={name:'Box',internalCode:'BOX',categoryId:null,isRentable:false,isSellable:false,showOnWebsite:false,publicationStatus:'ACTIVE',turnaroundBufferMinutes:null};
    assert.equal(validation.productInputSchema.safeParse(input).success,true);assert.equal(validation.productInputSchema.safeParse({...input,showOnWebsite:true}).success,false);
    const parsed=validation.productInputSchema.parse(input);assert.equal('directIsRentableOverride'in parsed,false);
    const legacy=validation.productInputSchema.parse({...input,showOnWebsite:undefined});
    assert.equal(legacy.showOnWebsite,undefined);assert.equal('directShowOnWebsiteOverride' in legacy,false);
    const execution=validation.executionInputSchema.parse({productId:id,code:'BLUE',name:'Blue'});assert.equal('isRentableOverride'in execution,false);
    assert.equal(validation.productInputSchema.parse({...input,directIsRentableOverride:null}).directIsRentableOverride,null);
  });
  await test('fresh reservation rejects disabled draft before capacity/events/writes',async()=>{
    await assert.rejects(rental.reserveOrder(tenant,'order',actor),/больше нельзя бронировать/);assert.equal(writes.length,0);assert.equal(capacityCalls,0);
  });
  await test('reserved rental confirmation rechecks policy before charges and writes',async()=>{
    reset('RESERVED');await assert.rejects(rental.confirmOrder(tenant,'order',actor),/больше нельзя арендовать/);assert.equal(writes.length,0);assert.equal(financialCorrections,0);
  });
  await test('new sale confirmation rejects disabled group before stock commitments/writes',async()=>{
    reset('DRAFT','SALE');await assert.rejects(sale.confirmSale(tenant,'order',[],'test',actor,tx),/больше нельзя продавать/);assert.equal(writes.length,0);
  });
  await test('matching sale confirmation replay survives later disable without new eligibility/stock writes',async()=>{
    reset('CONFIRMED','SALE');events={payload:{idempotencyKey:'test',payloadHash:crypto.createHash('sha256').update('[]').digest('hex')}};
    const result=await sale.confirmSale(tenant,'order',[],'test',actor,tx);assert.equal(result,order);assert.equal(policyReads,0);assert.equal(writes.length,0);
  });
  await test('existing rental commercial correction allowed; quantity increase and replacement denied',async()=>{
    reset('CONFIRMED');await rental.updateOrderItem(tenant,'order','item',{productVariantId:id,quantity:1,unitPriceMinor:100n,discountMinor:1n},actor);
    assert.equal(financialCorrections,1);assert.equal(writes.find(([table])=>table==='item')[1].data.discountTotalMinor,1n);
    reset('CONFIRMED');await assert.rejects(rental.updateOrderItem(tenant,'order','item',{productVariantId:id,quantity:2,unitPriceMinor:100n},actor),/Вариант товара не найден/);assert.equal(writes.length,0);
    reset('CONFIRMED');await assert.rejects(rental.updateOrderItem(tenant,'order','item',{productVariantId:executionId,quantity:1,unitPriceMinor:100n},actor),/Вариант товара не найден/);assert.equal(writes.length,0);
  });
  await test('duplicate IDs use one eligibility query; an unknown/disabled ID cannot pass',async()=>{
    rows=[variant()];assert.equal(await policy.variantsAllowOperation(tx,org,[id,id],'RENTAL'),true);assert.equal(policyReads,1);
    assert.equal(await policy.variantsAllowOperation(tx,org,[id,'missing'],'RENTAL'),false);assert.equal(await policy.variantsAllowOperation(tx,org,[],'RENTAL'),false);
  });
  await test('existing order discount correction survives disable; changing booked dates fails before writes',async()=>{
    const raw={branchId:id,customerId:executionId,source:'CRM',rentalStart:new Date('2026-10-06'),rentalEnd:new Date('2026-10-07'),discountMinor:1n};
    reset('CONFIRMED');order.branchId=id;order.customerId=executionId;
    await rental.updateOrder(tenant,'order',raw,actor);assert.equal(financialCorrections,1);assert.equal(policyReads,0);
    reset('CONFIRMED');order.branchId=id;order.customerId=executionId;
    await assert.rejects(rental.updateOrder(tenant,'order',{...raw,rentalEnd:new Date('2026-10-08')},actor),/новую бронь/);assert.equal(writes.length,0);assert.equal(financialCorrections,0);
  });
  await test('createOrder locks the entire reverse-input batch before capacity or item writes',async()=>{
    rows=[variant(),{...variant(),id:executionId}];policyLockBatches.length=0;
    const raw={branchId:id,customerId:executionId,source:'CRM',rentalStart:new Date('2026-10-06'),rentalEnd:new Date('2026-10-07')};
    const items=[executionId,id].map(productVariantId=>({productVariantId,quantity:1,unitPriceMinor:100n}));
    await assert.rejects(rental.createOrder(tenant,raw,items,actor),/unexpected capacity quote/);
    assert.deepEqual(policyLockBatches,[[id,executionId]]);assert.equal(policyReads,1);assert.equal(writes.length,0);
    rows[1].product.directIsRentableOverride=false;policyLockBatches.length=0;
    await assert.rejects(rental.createOrder(tenant,raw,items,actor),/недоступен для аренды/);
    assert.deepEqual(policyLockBatches,[[id,executionId]]);assert.equal(writes.length,0);
  });
  console.log(`Catalog operation policy regression: ${passed}/${passed}; 432 matrix cases; no real operations.`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
