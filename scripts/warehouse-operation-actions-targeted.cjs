// Server-action boundary tests; no database, network, environment or owner data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let calls, denied, mode, instanceExists;
const session = { organizationId: 'org', membershipId: 'member', userId: 'user' };
const services = Object.fromEntries(['receiveBulk','receiveSerialized','transferBulk','transferSerialized','changeBulk','changeSerializedStatus'].map(name => [name, async (...args) => calls.push({ name, args })]));
const dependencies = {
  '@/lib/db': { db: { productVariant: { findFirst: async () => ({ product: { trackingMode: mode } }) }, productInstance: { findFirst: async () => instanceExists ? { id: 'instance' } : null } } },
  'next/cache': { revalidatePath() {} },
  'next/navigation': { redirect(url) { throw Object.assign(new Error(url), { redirect: true }); }, unstable_rethrow(error) { if (error.redirect) throw error; } },
  '@/lib/auth/session': { requireRouteAccess: async () => session },
  '@/lib/permissions/effective': { requirePermission: async (_session, permission) => { if (denied.has(permission)) throw new Error('Denied ' + permission); } },
  '@/lib/tenant/context': { createTenantContext: organizationId => ({ organizationId }) },
  '@/lib/staff/branch-access': { requireBranchAccess: async (_tenant, _membership, branch) => { if (!['a','b'].includes(branch)) throw new Error('Branch denied'); } },
  '@/lib/inventory/management': services,
};
const moduleObject = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../app/warehouse/operation-action.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext('(function(require,module,exports){' + code + '\n})', { Error, Number })(name => { assert(name in dependencies, name); return dependencies[name]; }, moduleObject, moduleObject.exports);
function form(overrides = {}) { const form = new FormData(); for (const [key, value] of Object.entries({ operation:'receipts', mode, variantId:'variant', instanceId:'instance', branchId:'a', locationId:'place-a', fromBranchId:'a', fromLocationId:'place-a', toBranchId:'b', toLocationId:'place-b', quantity:'2', reason:'Test reason', confirmed:'yes', idempotencyKey:'00000000-0000-4000-8000-000000000001', ...overrides })) form.set(key,value); return form; }
function reset(tracking = 'BULK') { calls=[]; denied=new Set(); mode=tracking; instanceExists=true; }
async function rejected(overrides) { const result = await moduleObject.exports.warehouseOperationAction(form(overrides)); assert(result?.error); assert.equal(calls.length,0); }
(async () => {
  for (const [operation, service] of [['receipts','receive'],['transfers','transfer'],['write-offs','change']]) {
    for (const tracking of ['BULK','SERIALIZED']) {
      reset(tracking);
      await assert.rejects(moduleObject.exports.warehouseOperationAction(form({ operation })), error => error.redirect && error.message === '/warehouse/'+operation+'?ok=1');
      assert.equal(calls.length,1);
      assert.equal(calls[0].name,service+(tracking==='BULK'?'Bulk':operation==='write-offs'?'SerializedStatus':'Serialized'));
      assert.equal(calls[0].args[0].organizationId,'org');
      if (operation==='write-offs'&&tracking==='BULK') assert.equal(calls[0].args[1].delta,-2);
    }
  }
  for (const permission of ['INVENTORY_VIEW','INVENTORY_RECEIVE']) { reset(); denied.add(permission); await rejected({}); }
  for (const permission of ['INVENTORY_WRITE_OFF','INVENTORY_ADJUST']) { reset(); denied.add(permission); await rejected({operation:'write-offs'}); }
  for (const overrides of [{branchId:'foreign'}, {quantity:'1.5'}, {quantity:'2junk'}, {quantity:'0'}, {mode:'SERIALIZED'}, {idempotencyKey:''}, {operation:'write-offs',confirmed:''}, {operation:'write-offs',reason:''}, {operation:'transfers',toBranchId:'foreign'}, {operation:'transfers',toBranchId:'a',toLocationId:'place-a'}]) { reset(); await rejected(overrides); }
  reset('SERIALIZED'); instanceExists=false; await rejected({operation:'write-offs'});
  console.log('PASS warehouse actions: six Core routes, permission/branch checks, tracking match, whole quantities, confirmation/reason, redirect propagation');
})().catch(error => { console.error(error); process.exitCode=1; });
