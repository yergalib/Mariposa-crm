// Deterministic isolated row-lock scheduler with the REAL SQL guard/resolver.
// No PostgreSQL/DB/network/env loaded. This verifies ordering and recheck behavior,
// not the database engine's locking implementation; real PostgreSQL contention NOTRUN.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
const org='11111111-1111-4111-8111-111111111111',variantId='22222222-2222-4222-8222-222222222222',productId='33333333-3333-4333-8333-333333333333',executionId='44444444-4444-4444-8444-444444444444',sizeId='55555555-5555-4555-8555-555555555555';
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function matches(row,where={}){return Object.entries(where).every(([key,value])=>{
 if(key==='AND')return value.every(w=>matches(row,w));if(key==='OR')return value.some(w=>matches(row,w));const actual=row?.[key];
 if(value===null||typeof value!=='object')return actual===value;if('in'in value)return value.in.includes(actual);if('not'in value)return actual!==value.not;
 return actual!=null&&matches(actual,value);
});}
class RowLocks {
 constructor(){this.held=new Map();this.waiters=[];}
 can(tx,key,mode){const holders=this.held.get(key)??[];return holders.every(h=>h.tx===tx||(mode==='SHARE'&&h.mode==='SHARE'));}
 async acquire(tx,key,mode){if(!this.can(tx,key,mode))await new Promise(resolve=>this.waiters.push({tx,key,mode,resolve}));
  const holders=this.held.get(key)??[];if(!holders.some(h=>h.tx===tx))holders.push({tx,mode});this.held.set(key,holders);}
 release(tx){for(const [key,holders] of this.held){this.held.set(key,holders.filter(h=>h.tx!==tx));}
  const ready=this.waiters.filter(w=>this.can(w.tx,w.key,w.mode));this.waiters=this.waiters.filter(w=>!ready.includes(w));for(const waiter of ready)waiter.resolve();}
}
const cache=new Map();function load(file){if(cache.has(file))return cache.get(file);assert.ok(['lib/catalog/operation-policy.ts','lib/catalog/operation-policy-guard.ts'].includes(file));const record={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=name=>name==='server-only'?{}:name==='@/generated/prisma/client'?{Prisma:{sql:(strings,...values)=>({strings,values}),join:values=>values}}:load(path.posix.join(path.posix.dirname(file),name)+'.ts');
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{})(req,record,record.exports);cache.set(file,record.exports);return record.exports;}
const {variantsAllowOperation}=load('lib/catalog/operation-policy-guard.ts');
function fixture(){const locks=new RowLocks(),read=deferred(),row={id:variantId,organizationId:org,productId,executionId,sizeId,isActive:true,
 product:{id:productId,organizationId:org,archivedAt:null,publicationStatus:'ACTIVE',isRentable:true,isSellable:true,showOnWebsite:true},
 execution:{id:executionId,organizationId:org,productId,isActive:true,isRentableOverride:null,isSellableOverride:null,showOnWebsiteOverride:null},size:{id:sizeId,organizationId:org,isActive:true}};
 let writes=0,failLock=false;const log=[];
 function client(tx){return {
  $queryRaw:async q=>{
   const sql=q.strings.join('?');assert.match(sql,/ORDER BY id FOR SHARE/);assert.equal(q.values[0],org);
   const table=sql.match(/FROM public\.(\w+)/)[1],ids=q.values[1];assert.equal(ids.length,new Set(ids).size);assert.equal([...ids].sort().join(','),ids.join(','));
   log.push(table);if(failLock)throw Error('simulated lock timeout');for(const id of ids)await locks.acquire(tx,table+':'+id,'SHARE');
   if(table==='product_variants')return [{id:variantId,product_id:productId,execution_id:executionId,size_id:sizeId}];
   if(table==='product_executions')return [{id:executionId,product_id:row.execution.productId}];
   return [{id:table==='products'?productId:sizeId}];
  },productVariant:{findMany:async q=>{read.resolve();return matches(row,q.where)?[{id:variantId}]:[];}},
 };}
 const transaction=async(tx,fn)=>{try{return await fn(client(tx));}finally{locks.release(tx);}};
 const writer=async(tx,table,id,mutate,hold)=>{try{await locks.acquire(tx,table+':'+id,'UPDATE');if(hold)await hold;mutate();}finally{locks.release(tx);}};
 return {locks,row,read,log,transaction,writer,get writes(){return writes;},write(){writes++;},fail(){failLock=true;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
async function main(){
 await test('disable after eligibility check waits for commitment commit; all policy rows remain locked',async()=>{
  const f=fixture(),hold=deferred();let disabled=false;
  const order=f.transaction('order',async tx=>{assert.equal(await variantsAllowOperation(tx,org,[variantId],'RENTAL',true),true);await hold.promise;f.write();});
  await f.read.promise;const disable=f.writer('disable','product_executions',executionId,()=>{f.row.execution.isRentableOverride=false;disabled=true;});
  await tick();assert.equal(disabled,false);assert.equal(f.writes,0);assert.deepEqual(f.log,['product_variants','products','product_executions','sizes']);
  hold.resolve();await order;await disable;assert.equal(f.writes,1);assert.equal(disabled,true);
  await f.transaction('new',async tx=>assert.equal(await variantsAllowOperation(tx,org,[variantId],'RENTAL',true),false));
 });
 await test('disable commits while guard waits: fresh eligibility recheck denies before new write',async()=>{
  const f=fixture(),hold=deferred();let started=false;
  const disable=f.writer('disable','product_executions',executionId,()=>{f.row.execution.isRentableOverride=false;},hold.promise);await tick();
  const order=f.transaction('order',async tx=>{started=true;if(await variantsAllowOperation(tx,org,[variantId],'RENTAL'))f.write();});
  await tick();assert.equal(started,true);assert.equal(f.writes,0);assert.ok(f.locks.waiters.some(w=>w.key==='product_executions:'+executionId));
  hold.resolve();await disable;await order;assert.equal(f.writes,0);
 });
 await test('ordinary legacy model/variant/size UPDATE also waits; publication disable blocks fresh public inquiry',async()=>{
  for(const [table,id,mutate] of [['products',productId,f=>{f.row.product.isRentable=false;}],['product_variants',variantId,f=>{f.row.isActive=false;}],['sizes',sizeId,f=>{f.row.size.isActive=false;}],['product_executions',executionId,f=>{f.row.execution.showOnWebsiteOverride=false;}]]){
   const f=fixture(),hold=deferred();let changed=false;
   const order=f.transaction('order',async tx=>{assert.equal(await variantsAllowOperation(tx,org,[variantId],'RENTAL',true),true);await hold.promise;f.write();});await f.read.promise;
   const disable=f.writer('legacy',table,id,()=>{mutate(f);changed=true;});await tick();assert.equal(changed,false);
   hold.resolve();await order;await disable;
   await f.transaction('new',async tx=>assert.equal(await variantsAllowOperation(tx,org,[variantId],'RENTAL',true),false));
  }
 });
 await test('lock error propagates and never writes; inconsistent execution binding fails closed',async()=>{
  const f=fixture();f.fail();await assert.rejects(f.transaction('order',async tx=>{if(await variantsAllowOperation(tx,org,[variantId],'SALE'))f.write();}),/lock timeout/);assert.equal(f.writes,0);
  const foreign=fixture();foreign.row.execution.productId='other';await foreign.transaction('order',async tx=>{assert.equal(await variantsAllowOperation(tx,org,[variantId],'RENTAL'),false);});assert.equal(foreign.writes,0);
 });
 console.log(`Policy concurrency scheduler: ${passed}/${passed}; actual guard SQL and ordered promises; real PostgreSQL NOTRUN.`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
