// Targeted P0 authorization checks. Real guards/settings service; no network or database.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
const org='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const actor={organizationId:org,membershipId:'member',userId:'user'};
let role='SELLER',effect,active=true,writes=[],audits=[],lookups=0;
const tx={organizationMembership:{findFirst:async({where})=>{lookups++;assert.equal(where.organizationId,org);assert.equal(where.userId,actor.userId);assert.equal(where.status,'ACTIVE');assert.equal(where.user.status,'ACTIVE');return active?{role,permissionOverrides:effect?[{effect}]:[],branchAccess:[{branchId:branch}]}:null}},
 branch:{findFirst:async({where})=>where.id===branch?{id:branch}:null,findFirstOrThrow:async()=>({timezone:'Asia/Almaty'}),update:async input=>{writes.push(input);return{id:branch}},create:async input=>{writes.push(input);return{id:other}}},
 organization:{update:async input=>writes.push(input)},organizationSettings:{findUnique:async()=>({turnaroundBufferMinutes:0}),upsert:async input=>writes.push(input)},
 location:{findFirst:async()=>null,create:async input=>{writes.push(input);return{id:other}}},
 paymentMethod:{findFirst:async()=>({code:'CASH',isActive:true}),update:async input=>{writes.push(input);return{id:other}},create:async input=>{writes.push(input);return{id:other}}},
 auditLog:{create:async({data})=>audits.push(data)}};
const stubs={'server-only':{},zod:require('zod'),'@/lib/db':{db:{$transaction:fn=>fn(tx)}}};
const allowed=new Set(['lib/orders/commercial-permissions.ts','lib/orders/errors.ts','lib/permissions/registry.ts','lib/settings-business.ts','lib/audit/log.ts']);const cache=new Map();
function load(file){assert.ok(allowed.has(file),file);if(cache.has(file))return cache.get(file);const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Buffer,Intl,Date},{filename:file})(name=>{if(Object.hasOwn(stubs,name))return stubs[name];return load((name.startsWith('@/')?name.slice(2):path.posix.join(path.posix.dirname(file),name))+'.ts')},mod,mod.exports);cache.set(file,mod.exports);return mod.exports}
const {guardCommercialChange:guard}=load('lib/orders/commercial-permissions.ts'),{saveBusinessSetting:save}=load('lib/settings-business.ts');
let passed=0;async function test(name,run){role='SELLER';effect=undefined;active=true;writes=[];audits=[];lookups=0;await run();passed++;console.log('PASS '+name)}
async function main(){
 await test('seller may retain approved commercial terms without override',async()=>{await guard(tx,org,actor,{price:700n,referencePrice:700n,discount:20n,previousDiscount:20n});assert.equal(lookups,0)});
 await test('seller cannot change price, including missing catalogue price',async()=>{for(const referencePrice of [500n,undefined])await assert.rejects(guard(tx,org,actor,{price:1n,referencePrice,discount:0n}),e=>e.code==='FORBIDDEN')});
 await test('seller cannot add or remove a discount without permission',async()=>{for(const [discount,previousDiscount] of [[1n,0n],[0n,1n]])await assert.rejects(guard(tx,org,actor,{discount,previousDiscount}),e=>e.code==='FORBIDDEN')});
 await test('director defaults permit commercial changes; explicit deny wins',async()=>{role='DIRECTOR';await guard(tx,org,actor,{price:1n,referencePrice:500n,discount:10n});effect='DENY';await assert.rejects(guard(tx,org,actor,{discount:10n}));});
 await test('explicit allow works only for active identified employee',async()=>{effect='ALLOW';await guard(tx,org,actor,{discount:10n});active=false;await assert.rejects(guard(tx,org,actor,{discount:10n}));await assert.rejects(guard(tx,org,{}, {discount:10n}));});
 const branchInput={kind:'branch',id:branch,name:'Astana',code:'AST',city:'Astana',address:'',phone:'',timezone:'Asia/Almaty'};
 await test('seller settings denied before writes',async()=>{await assert.rejects(save(actor,branchInput));assert.equal(writes.length,0);assert.equal(audits.length,0)});
 await test('director can edit accessible branch with audit, not foreign branch',async()=>{role='DIRECTOR';await save(actor,branchInput);assert.equal(writes.length,1);assert.equal(audits.length,1);assert.equal(audits[0].branchId,branch);await assert.rejects(save(actor,{...branchInput,id:other}));assert.equal(writes.length,1)});
 await test('director cannot create branch or change global settings/timezone',async()=>{role='DIRECTOR';for(const input of [{...branchInput,id:undefined},{...branchInput,timezone:'UTC'},{kind:'organization',name:'Test',turnaroundBufferMinutes:10},{kind:'payment',code:'CASH',displayName:'Cash',isActive:false}])await assert.rejects(save(actor,input));assert.equal(writes.length,0)});
 await test('owner may disable method without deleting financial history',async()=>{role='OWNER';await save(actor,{kind:'payment',id:other,code:'CASH',displayName:'Cash',isActive:false});assert.equal(writes[0].data.isActive,false);assert.equal(audits[0].metadata.previousValue,'true');assert.equal(audits[0].metadata.newValue,'false');await assert.rejects(save(actor,{kind:'payment',id:other,code:'OTHER',displayName:'Cash',isActive:true}));assert.equal(writes.length,1)});
 await test('invalid settings and foreign locations rejected without writes',async()=>{role='OWNER';for(const input of [{...branchInput,timezone:'Invalid/Zone'},{kind:'organization',name:'Test',turnaroundBufferMinutes:-1},{kind:'location',id:other,branchId:branch,name:'Shelf',code:'A',type:'WAREHOUSE'}])await assert.rejects(save(actor,input));assert.equal(writes.length,0)});
 console.log(`P0 foundation targeted: ${passed}/${passed}; mock writes only.`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
