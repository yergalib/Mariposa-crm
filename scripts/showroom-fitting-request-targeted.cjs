// Isolated service test: no DB, network, environment files or application gate changes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1), branchId = id(2), variantId = id(3), productId = id(4);
let saved, audits, quota, blockedBranch, blockedVariant, blockedProduct, locks;
let chain = Promise.resolve();
const env = { STOREFRONT_ORGANIZATION_ID: org };
const cache = new Map();
const guard = object => new Proxy(object, { get(target, key) {
  if (!(key in target)) throw Error(`Forbidden DB operation: ${String(key)}`);
  return target[key];
} });
const row = id => ({ id, sku: 'SYNTHETIC', execution: null, product: { name: 'Synthetic dress' }, size: { name: 'M', code: 'M' } });
let policy;
const tx = guard({
  $executeRaw: async (_strings, scope) => { assert.equal(scope, `showroom:${org}`); locks++; },
  branch: guard({ findFirst: async ({ where }) => {
    assert.deepEqual(JSON.parse(JSON.stringify(where)), { organizationId: org, isPublic: true, status: 'ACTIVE', organization: { status: 'ACTIVE' }, id: branchId });
    return blockedBranch ? null : { timezone: 'Asia/Almaty' };
  } }),
  productVariant: guard({
    findFirst: async ({ where }) => { assert.deepEqual(where.AND[0], policy); return blockedVariant ? null : row(where.AND[1].id); },
    findMany: async ({ where }) => { assert.deepEqual(where.AND[0], policy); return blockedVariant ? [] : where.AND[1].id.in.map(row); }
  }),
  product: guard({ findFirst: async ({ where }) => {
    assert.equal(where.organizationId, org); assert.equal(where.id, productId); assert.deepEqual(where.variants.some, policy);
    return blockedProduct ? null : { id: productId, name: 'Synthetic model' };
  } }),
  inquiry: guard({
    findUnique: async ({ where }) => { assert.equal(where.organizationId_creationKey.organizationId, org); return saved.find(x => x.creationKey === where.organizationId_creationKey.creationKey) ?? null; },
    count: async ({ where }) => { assert.equal(where.organizationId, org); assert.equal(where.source, 'WEBSITE'); assert.equal(where.createdByUserId, null); return where.replyContact ? quota.contact : quota.total; },
    create: async ({ data }) => { saved.push(data); return { id: id(100 + saved.length) }; }
  })
});
const db = guard({ $transaction: async fn => {
  const result = chain.then(() => fn(tx)); chain = result.catch(() => {}); return result;
} });
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
  const requireIsolated = name => {
    if (name === 'server-only') return {};
    if (name === './photos') return new Proxy({}, { get() { throw Error('Forbidden photo access'); } });
    if (name === '@/lib/db') return { db };
    if (name === '@/generated/prisma/client') return { Prisma: {} };
    if (name === '@/lib/audit/log') return { appendAuditLog: async (_tx, event) => { audits.push(event); } };
    if (name === './release') return { PUBLIC_INQUIRY_INTAKE_OPEN: true }; // test VM only
    if (name === '@/lib/availability/capacity') return { getVariantAvailability: () => { throw Error('Forbidden availability read'); } };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
    if (['zod', 'node:crypto'].includes(name)) return require(name);
    throw Error(`Unapproved dependency: ${name}`);
  };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { process: { env }, Date, Buffer, console })(requireIsolated, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
function reset() { saved = []; audits = []; quota = { total: 0, contact: 0 }; blockedBranch = blockedVariant = blockedProduct = false; locks = 0; }
function local(days) { const date = new Date(Date.now() + days * 86400000); return date.toISOString().slice(0, 16); }
const base = () => ({ purpose: 'fitting', branchId, creationKey: crypto.randomUUID(), replyContact: ' SYNTHETIC@EXAMPLE.INVALID ', website: '' });
const booking = () => ({ ...base(), purpose: 'booking', variantId, from: local(2), until: local(3) });
(async () => {
  // These imports are pure helpers; no production client is loaded.
  policy = load('lib/catalog/operation-policy.ts').variantOperationWhere(org, 'RENTAL', true);
  const { publicInquiryInput, selectionInput } = load('lib/showroom/contracts.ts');
  const { submitPublicInquiry: submit } = load('lib/showroom/service.ts');
  const reject = async (input, status = 400) => { reset(); await assert.rejects(submit(input), error => error.status === status); assert.equal(saved.length, 0); assert.equal(audits.length, 0); };
  reset(); await submit(base());
  assert.equal(saved.length, 1); assert.equal(saved[0].requestedFrom, null); assert.equal(saved[0].requestedUntil, null); assert.equal(saved[0].requestedSize, null);
  assert.equal(saved[0].items.create.length, 0); assert.equal(saved[0].replyContact, 'synthetic@example.invalid'); assert.match(saved[0].requestText, /не подтверждена.*не резервируется/); assert.match(saved[0].requestText, /30 минут/);
  assert.equal(saved[0].status, undefined); assert.equal(audits[0].action, 'INQUIRY_CREATED');
  reset(); await submit({ ...base(), variantId, additionalVariantIds: [id(5)], preferredVisit: local(4) });
  assert.equal(saved[0].items.create.length, 2); assert.equal(saved[0].requestedFrom, null); assert.match(saved[0].requestText, /Asia\/Almaty/);
  reset(); await submit({ ...base(), productId }); assert.equal(saved[0].items.create.length, 0); assert.equal(saved[0].requestedSize, null); assert.match(saved[0].requestText, /Размер уточнить/);
  for (const extra of [{ from: local(2), until: local(3) }, { productId, variantId }, { additionalVariantIds: [id(5)] }, { variantId, additionalVariantIds: [variantId] }, { organizationId: org }, { assignedMembershipId: id(9) }, { status: 'SCHEDULED' }, { replyContact: '' }, { website: 'bot' }, { preferredVisit: local(-1) }, { preferredVisit: local(370) }, { preferredVisit: '2026-02-30T12:00' }]) await reject({ ...base(), ...extra });
  for (const purpose of ['booking', 'fitting']) {
    const request = purpose === 'booking' ? booking() : { ...base(), variantId };
    reset(); blockedBranch = true; await assert.rejects(submit(request), e => e.status === 404); assert.equal(saved.length, 0);
    reset(); blockedVariant = true; await assert.rejects(submit(request), e => e.status === 404); assert.equal(saved.length, 0);
    for (const limits of [{ total: 30, contact: 0 }, { total: 0, contact: 3 }]) { reset(); quota = limits; await assert.rejects(submit(request), e => e.status === 429); assert.equal(saved.length, 0); }
    reset(); await Promise.all([submit(request), submit(request)]); assert.equal(saved.length, 1); assert.equal(audits.length, 1); assert.equal(locks, 2);
    await assert.rejects(submit({ ...request, requestText: 'changed' }), e => e.status === 409);
    saved[0].source = 'CRM'; await assert.rejects(submit(request), e => e.status === 409);
  }
  reset(); blockedProduct = true; await assert.rejects(submit({ ...base(), productId }), e => e.status === 404); assert.equal(saved.length, 0);
  for (const extra of [{ from: undefined }, { until: undefined }, { variantId: undefined }, { from: local(-1) }, { until: local(1) }, { until: local(40) }, { from: local(370), until: local(371) }, { preferredVisit: local(4) }]) await reject({ ...booking(), ...extra });
  reset(); const legacy = booking(); delete legacy.purpose; await submit(legacy); assert.ok(saved[0].requestedFrom instanceof Date); assert.ok(saved[0].requestedUntil > saved[0].requestedFrom); assert.equal(saved[0].items.create.length, 1);
  const parsed = publicInquiryInput.parse(legacy); assert.equal(parsed.purpose, 'booking');
  assert.equal(saved[0].creationHash, crypto.createHash('sha256').update(JSON.stringify({ purpose: 'booking', branchId, variantId, from: legacy.from, until: legacy.until, creationKey: legacy.creationKey, replyContact: 'synthetic@example.invalid', website: '' })).digest('hex'));
  assert.equal(selectionInput.safeParse({ branchId, variantId }).success, false);
  reset(); env.VERCEL_ENV = 'production'; await assert.rejects(submit(base()), e => e.status === 503); delete env.VERCEL_ENV; assert.equal(locks, 0);
  delete env.STOREFRONT_ORGANIZATION_ID; await assert.rejects(submit(base()), e => e.status === 503); assert.equal(locks, 0);
  console.log('PASS: fitting/booking split, optional interest, public policy guards, visit wishes, quotas, serialized idempotency, booking hash compatibility; Inquiry + audit only, no inventory/Fitting/availability/network.');
})().catch(error => { console.error(error); process.exitCode = 1; });

