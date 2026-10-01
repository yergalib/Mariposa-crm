// Actual services/import, synthetic transactional adapter. No real PostgreSQL concurrency claim.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
let contacts,events,batch,afterLock,customers;
const tenant={organizationId:'org'},customer={firstName:'Test',source:'CRM'};
const phone=value=>({type:'PHONE',value}),email=value=>({type:'EMAIL',value});
function reset(){contacts=[];customers=[{id:'self',organizationId:'org'},{id:'other',organizationId:'org'},{id:'foreign',organizationId:'foreign'}];events=[];afterLock=null;batch=null;}
function matching(row,where){return Object.entries(where).every(([k,v])=>v===undefined||typeof v==='object'&&v!==null?'not'in(v??{})?row[k]!==v.not:true:row[k]===v);}
function duplicates(q){return customers.filter(c=>c.organizationId===q.where.organizationId&&c.id!==q.where.id?.not&&contacts.some(x=>x.customerId===c.id&&q.where.contacts.some.OR.some(v=>x.type===v.type&&x.normalizedValue===v.normalizedValue))).map(c=>({...c,firstName:'Test',lastName:null,customerNumber:'C'}));}
const tx={
 $executeRaw:async (_parts,key)=>{events.push(['lock',JSON.parse(key)]);if(afterLock){const fn=afterLock;afterLock=null;fn(key);}},
 $queryRaw:async()=>{events.push(['counter']);return [{value:1n}];},
 customer:{findMany:async q=>{events.push(['duplicates',q]);return duplicates(q);},findFirst:async q=>{events.push(['customer-read']);return customers.find(x=>matching(x,q.where))??null;},create:async q=>{events.push(['customer-write']);const c={id:'new-'+customers.length,organizationId:q.data.organizationId};customers.push(c);contacts.push(...q.data.contacts.create.map(x=>({...x,id:'c-'+contacts.length,customerId:c.id})));return c;}},
 customerContact:{findFirst:async q=>{events.push(['contact-read']);const c=contacts.find(x=>matching(x,q.where));return c?{...c}:null;},create:async q=>{events.push(['contact-create']);const c={id:'c-'+contacts.length,...q.data};contacts.push(c);return c;},updateMany:async q=>{events.push(['primary-write']);for(const c of contacts.filter(x=>matching(x,q.where)))Object.assign(c,q.data);return {count:1};},update:async q=>{events.push(['contact-update',q.where]);const c=contacts.find(x=>matching(x,q.where));assert.ok(c);Object.assign(c,q.data);return c;}}
};
const db={
 $transaction:async (fn,options)=>{assert.equal(options.isolationLevel,'ReadCommitted');events.push(['begin']);const before=structuredClone(contacts),beforeCustomers=structuredClone(customers);try{const result=await fn(tx);events.push(['commit']);return result;}catch(e){contacts=before;customers=beforeCustomers;events.push(['rollback']);throw e;}},
 customer:{findMany:async q=>{events.push(['preview-duplicates',q]);return duplicates(q);}},
 customerImportBatch:{findFirst:async()=>batch,update:async q=>{events.push(['batch-update']);Object.assign(batch,q.data);return batch;},updateMany:async q=>{Object.assign(batch,q.data);return {count:1};}}
};
const sources=new Set(['lib/customers/normalization.ts','lib/customers/validation.ts','lib/customers/management.ts','lib/customers/errors.ts','lib/customers/import.ts']);
const cache=new Map();function load(file){if(cache.has(file))return cache.get(file);assert.ok(sources.has(file),file);const record={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=name=>{if(name==='server-only')return {};if(name==='@/lib/db')return {db};if(name==='@/generated/prisma/client')return {Prisma:{sql:(strings,...values)=>({strings,values})}};if(['zod','exceljs'].includes(name))return require(name);if(name.startsWith('@/'))return load(name.slice(2)+'.ts');throw Error(name);};
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Date,console,Buffer})(req,record,record.exports);cache.set(file,record.exports);return record.exports;}
reset();const service=load('lib/customers/management.ts'),validation=load('lib/customers/validation.ts'),normalization=load('lib/customers/normalization.ts'),imports=load('lib/customers/import.ts');
const create=(values,allowDuplicate=false)=>service.createCustomer(tenant,{customer,contacts:values,allowDuplicate});
const writes=()=>events.filter(([event])=>event.endsWith('write')||event==='contact-create'||event==='contact-update');
const lockKeys=()=>events.filter(([event,key])=>event==='lock'&&key[0]==='customer-contact').map(([,key])=>JSON.stringify(key));
let passed=0;async function test(name,fn){reset();await fn();passed++;console.log(`PASS ${name}`);}
async function main(){
 await test('minimal input validation and explicit international numbers before normalization',async()=>{
  for(const value of ['abc1234567','+7 701 123 45 67 доб.8','++77011234567','7701\n2345678','123','1234567890123456']){
   assert.equal(validation.contactSchema.safeParse(phone(value)).success,false);
   await assert.rejects(create([phone(value)],true));await assert.rejects(service.addContact(tenant,'self',phone(value)));await assert.rejects(service.updateContact(tenant,'x',phone(value)));assert.equal(events.length,0);
  }
  for(const value of ['not-email','a@@example.com','a b@example.com'])assert.equal(validation.contactSchema.safeParse(email(value)).success,false);
  for(const value of ['8 (701) 123-45-67','+7 7011234567','7011234567','+81 3 1234 5678','+44 20 1234 56','+1 (202) 555-0123','+49.30.123456','+380 44 123 45 67','+8613800138000'])assert.equal(validation.contactSchema.safeParse(phone(value)).success,true);
  assert.equal(normalization.normalizePhone('+81 3 1234 5678'),'+81312345678');assert.equal(normalization.normalizePhone('+44 20 1234 56'),'+4420123456');assert.equal(normalization.normalizePhone('8 (701) 123-45-67'),'+77011234567');
  for(const value of [' A+B@Example.COM ','имя@пример.рф'])assert.equal(validation.contactSchema.safeParse(email(value)).success,true);
  assert.equal(validation.contactSchema.safeParse({type:'OTHER',value:'arbitrary handle'}).success,true);
 });
 await test('create sorts/deduplicates tenant contact locks before duplicate read and writes',async()=>{
  await create([phone('+77011234567'),email('B@EXAMPLE.COM'),phone('87011234567')]);
  const keys=lockKeys();assert.equal(keys.length,2);assert.deepEqual(keys,[...keys].sort());assert.ok(keys.every(k=>JSON.parse(k)[1]==='org'));
  const names=events.map(x=>x[0]);assert.ok(names.lastIndexOf('lock')<names.indexOf('duplicates'));assert.ok(names.indexOf('duplicates')<names.indexOf('counter'));assert.equal(names.at(-1),'commit');assert.equal(contacts[1].normalizedValue,'b@example.com');
  events=[];await service.createCustomer({organizationId:'foreign'},{customer,contacts:[phone('+77011234567')]});assert.equal(JSON.parse(lockKeys()[0])[1],'foreign');assert.ok(!keys.includes(lockKeys()[0]));
 });
 await test('duplicate visible after lock wait rejects before allocation; explicit allowDuplicate preserved',async()=>{
  afterLock=()=>contacts.push({id:'existing',customerId:'other',organizationId:'org',type:'PHONE',normalizedValue:'+77011234567'});
  await assert.rejects(create([phone('87011234567')]),e=>e.code==='POSSIBLE_DUPLICATE');assert.equal(writes().length,0);assert.equal(events.some(x=>x[0]==='counter'),false);
  contacts=[{id:'existing',customerId:'other',organizationId:'org',type:'PHONE',normalizedValue:'+77011234567'}];events=[];await create([phone('+77011234567')],true);assert.equal(contacts.length,2);assert.equal(lockKeys().length,1);
 });
 await test('add excludes same customer, scopes tenant and primary writes after authoritative check',async()=>{
  contacts=[{id:'old',customerId:'self',organizationId:'org',type:'PHONE',normalizedValue:'+77011234567',isPrimary:true},{id:'f',customerId:'foreign',organizationId:'foreign',type:'PHONE',normalizedValue:'+77011234567'}];
  await service.addContact(tenant,'self',{...phone('87011234567'),isPrimary:true});
  assert.equal(events[1][1][0],'customer-contact-owner');const q=events.find(x=>x[0]==='duplicates')[1];assert.equal(q.where.id.not,'self');assert.equal(q.where.organizationId,'org');assert.ok(events.findIndex(x=>x[0]==='duplicates')<events.findIndex(x=>x[0]==='primary-write'));
  events=[];await assert.rejects(service.addContact(tenant,'foreign',phone('+12025550123')),e=>e.code==='NOT_FOUND');assert.equal(writes().length,0);
 });
 await test('update rereads after owner lock, locks old and new keys in stable order, retains tenant exclusion',async()=>{
  contacts=[{id:'edit',organizationId:'org',customerId:'self',type:'PHONE',normalizedValue:'+77011234567'}];
  afterLock=()=>{contacts[0].normalizedValue='+12025550123';};
  await service.updateContact(tenant,'edit',email(' New@Example.com '));
  assert.equal(events.filter(x=>x[0]==='contact-read').length,2);const keys=lockKeys();assert.equal(keys.length,2);assert.ok(keys.some(k=>k.includes('+12025550123')));assert.ok(!keys.some(k=>k.includes('+77011234567')));assert.deepEqual(keys,[...keys].sort());
  assert.equal(events.find(x=>x[0]==='duplicates')[1].where.id.not,'self');assert.equal(events.find(x=>x[0]==='contact-update')[1].organizationId,'org');assert.equal(contacts[0].normalizedValue,'new@example.com');
 });
 await test('add/update reject cross-customer duplicates, allow override and reject missing contact',async()=>{
  contacts=[{id:'edit',organizationId:'org',customerId:'self',type:'EMAIL',normalizedValue:'old@example.com'},{id:'other',organizationId:'org',customerId:'other',type:'EMAIL',normalizedValue:'new@example.com'}];
  await assert.rejects(service.addContact(tenant,'self',email('new@example.com')),e=>e.code==='POSSIBLE_DUPLICATE');
  await assert.rejects(service.updateContact(tenant,'edit',email('new@example.com')),e=>e.code==='POSSIBLE_DUPLICATE');assert.equal(writes().length,0);
  await service.updateContact(tenant,'edit',{...email('new@example.com'),allowDuplicate:true});assert.equal(contacts[0].normalizedValue,'new@example.com');
  events=[];await assert.rejects(service.updateContact(tenant,'missing',email('a@example.com')),e=>e.code==='NOT_FOUND');assert.equal(writes().length,0);
  await assert.rejects(service.updateContact({organizationId:'foreign'},'edit',email('a@example.com')),e=>e.code==='NOT_FOUND');assert.equal(writes().length,0);
 });
 await test('import marks invalid row, continues valid rows and rechecks contacts at confirmation',async()=>{
  batch={id:'batch',status:'UPLOADED',rawRows:{headers:['Name','Phone'],rows:[['Bad','abc1234567'],['Good','+81312345678']],formulaRows:[]}};
  const analysis=await imports.analyzeImport(tenant,'batch',{firstName:0,phone:1});assert.equal(analysis[0].status,'ERROR');assert.equal(analysis[1].status,'READY');
  contacts.push({id:'late',organizationId:'org',customerId:'other',type:'PHONE',normalizedValue:'+81312345678'});events=[];
  const result=await imports.confirmImport(tenant,'batch');assert.equal(result.imported,0);assert.equal(result.skipped,1);assert.equal(result.errors,1);assert.equal(writes().length,0);assert.equal(lockKeys().length,1);
  reset();batch={id:'batch',status:'UPLOADED',rawRows:{headers:['Name','Phone'],rows:[['Good','+81312345678']],formulaRows:[]}};
  await imports.analyzeImport(tenant,'batch',{firstName:0,phone:1});events=[];const success=await imports.confirmImport(tenant,'batch');assert.equal(success.imported,1);assert.equal(success.errors,0);assert.equal(lockKeys().length,1);assert.equal(contacts[0].normalizedValue,'+81312345678');
 });
 await test('runtime contact writers remain centralized in audited management service',async()=>{
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);
  const writers=[...walk('app'),...walk('lib')].filter(f=>/\.[tj]sx?$/.test(f)&&/\bcustomerContact\.(?:create|update|updateMany|upsert)\s*\(/.test(fs.readFileSync(f,'utf8')));
  assert.deepEqual(writers.map(x=>x.replaceAll('\\','/')),['lib/customers/management.ts']);
 });
 console.log(`Customer contact regression: ${passed}/${passed}; mock sequencing only, PostgreSQL concurrency NOTRUN.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
