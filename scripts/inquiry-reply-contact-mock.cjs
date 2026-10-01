// No application DB, env loader, network client or external channel is loaded.
// Execute the real validation/service/action/component code with allowlisted dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const zod = require('zod');

const org = '11111111-1111-4111-8111-111111111111';
const branch = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const key = '44444444-4444-4444-8444-444444444444';
const other = '55555555-5555-4555-8555-555555555555';
const session = { organizationId: org, membershipId: id, userId: id, role: 'SELLER' };
const fields = { subject: 'Synthetic inquiry', customerLabel: '', requestText: '', requestedSize: '',
  requestedFrom: '', requestedUntil: '', nextAction: '', nextActionAt: '', assignedMembershipId: '' };
const create = { ...fields, branchId: branch, source: 'CRM', creationKey: key, variantIds: [] };
let row, audit, writes, denied, branches, conflict, authSession, routeCalls, revalidated, permissionChecks;
function reset() {
  row = null; audit = []; writes = 0; denied = new Set(); branches = [branch]; conflict = false;
  authSession = session; routeCalls = 0; revalidated = []; permissionChecks = [];
}
function inScope(where) {
  assert.ok(where.organizationId, 'tenant filter is mandatory');
  assert.equal(where.branch.organizationId, where.organizationId);
  assert.equal(where.branch.status, 'ACTIVE');
  assert.ok(Array.isArray(where.branchId.in), 'restricted branch filter is mandatory');
  return row && row.organizationId === where.organizationId && where.branchId.in.includes(row.branchId)
    && (!where.id || row.id === where.id);
}
class KnownRequestError extends Error {}
class Redirect extends Error { constructor(url) { super('redirect'); this.url = url; } }
const db = {
  inquiry: {
    findUnique: async ({ where }) => row && row.organizationId === where.organizationId_creationKey.organizationId
      && row.creationKey === where.organizationId_creationKey.creationKey ? { ...row } : null,
    findFirst: async ({ where }) => inScope(where) ? { ...row, branch: { timezone: 'Asia/Almaty', name: 'Synthetic branch' }, items: [] } : null,
    create: async ({ data }) => {
      assert.equal(data.organizationId, org); assert.equal(data.branchId, branch);
      row = { id, version: 1, status: 'NEW', replyContact: null, ...data }; writes++; return { id };
    },
    updateMany: async ({ where, data }) => {
      if (!inScope(where) || where.version !== row.version || conflict) return { count: 0 };
      row = { ...row, ...data, version: row.version + data.version.increment }; writes++; return { count: 1 };
    },
  },
  branch: { findFirst: async ({ where }) => where.organizationId === org && where.id === branch && where.status === 'ACTIVE'
    ? { timezone: 'Asia/Almaty' } : null },
  productVariant: { findMany: async () => [] },
  $transaction: null,
};
// Unexpected model access (orders, payments, allocations, etc.) fails immediately.
const safeDb = new Proxy(db, { get(target, name) {
  if (!(name in target)) throw new Error(`Unexpected DB model: ${String(name)}`);
  return target[name];
} });
db.$transaction = async callback => {
  const before = { row: structuredClone(row), audit: structuredClone(audit), writes };
  try { return await callback(safeDb); }
  catch (error) { ({ row, audit, writes } = before); throw error; }
};
const stubs = {
  'server-only': {}, 'node:crypto': { createHash }, zod,
  '@/generated/prisma/client': { Prisma: { PrismaClientKnownRequestError: KnownRequestError } },
  '@/lib/db': { db: safeDb },
  '@/lib/permissions/effective': {
    requirePermission: async (_session, permission) => { permissionChecks.push(permission); if (denied.has(permission)) throw new Error('permission denied'); },
    hasPermission: async (_session, permission) => !denied.has(permission),
  },
  '@/lib/staff/branch-access': {
    accessibleBranchIds: async () => branches,
    requireBranchAccess: async (tenant, _member, branchId) => {
      if (tenant.organizationId !== org || !branches.includes(branchId)) throw new Error('branch denied');
    },
  },
  '@/lib/tenant/context': { createTenantContext: organizationId => ({ organizationId }) },
  '@/lib/audit/log': { appendAuditLog: async (_tx, event) => { audit.push(event); } },
  '@/lib/auth/session': { requireRouteAccess: async route => { assert.equal(route, '/chats'); routeCalls++; return authSession; } },
  'next/navigation': { redirect: url => { throw new Redirect(url); }, unstable_rethrow: error => { if (error instanceof Redirect) throw error; } },
  'next/cache': { revalidatePath: url => revalidated.push(url) },
  react: { useState: value => [value, () => {}], useActionState: (_action, value) => [value, () => {}, false] },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
};
const allowedSources = new Set(['lib/inquiries/validation.ts', 'lib/inquiries/service.ts', 'lib/permissions/registry.ts',
  'lib/calendar/timezone.ts', 'app/chats/actions.ts', 'app/chats/InquiryForm.tsx']);
const cache = new Map();
function load(file) {
  assert.ok(allowedSources.has(file), `Source not allowlisted: ${file}`);
  if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} }; cache.set(file, loaded.exports);
  const code = ts.transpileModule(fs.readFileSync(path.resolve(file), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const localRequire = name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    const base = name.startsWith('@/') ? name.slice(2) : name.startsWith('.') ? path.posix.join(path.posix.dirname(file), name) : null;
    assert.ok(base, `Dependency not allowlisted: ${name}`);
    const target = [base, `${base}.ts`, `${base}.tsx`].find(candidate => allowedSources.has(candidate));
    assert.ok(target, `Dependency not allowlisted: ${name}`); return load(target);
  };
  vm.runInNewContext('(function(require,module,exports){' + code + '\n})', { console, Date, FormData }, { filename: file })(localRequire, loaded, loaded.exports);
  cache.set(file, loaded.exports); return loaded.exports;
}
const validation = load('lib/inquiries/validation.ts');
const service = load('lib/inquiries/service.ts');
const { saveInquiryAction } = load('app/chats/actions.ts');
const { InquiryForm } = load('app/chats/InquiryForm.tsx');
const update = replyContact => ({ ...fields, id, version: row.version, status: 'NEW', replyContact });
let passed = 0;
async function check(name, fn) { reset(); await fn(); passed++; console.log(`PASS ${name}`); }
async function seed() { await service.createInquiry(session, { ...create, replyContact: 'old@example.invalid' }); }
function form(input) { const value = new FormData(); for (const [key, item] of Object.entries(input)) if (!Array.isArray(item) && item !== undefined) value.set(key, String(item)); return value; }
function nodes(node) { return !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]; }
async function main() {
  await check('optional, blank and canonical contact validation', () => {
    assert.equal(validation.createInquiryInput.parse(create).replyContact, undefined);
    assert.equal(validation.createInquiryInput.parse({ ...create, replyContact: '  ' }).replyContact, '');
    assert.equal(validation.createInquiryInput.parse({ ...create, replyContact: ' Inbox@Example.Invalid ' }).replyContact, 'inbox@example.invalid');
    assert.equal(validation.createInquiryInput.parse({ ...create, replyContact: ' +1 (202) 555-0100 ' }).replyContact, '+12025550100');
    assert.equal(validation.createInquiryInput.safeParse({ ...create, replyContact: '1'.repeat(7) }).success, true);
    assert.equal(validation.createInquiryInput.safeParse({ ...create, replyContact: '1'.repeat(15) }).success, true);
    for (const value of ['abc', 'a@', '---', '( )', '1'.repeat(6), '1'.repeat(16), 'a'.repeat(255), 'x@example.invalid\ny@example.invalid', '<script>x</script>', null, 123]) {
      assert.equal(validation.createInquiryInput.safeParse({ ...create, replyContact: value }).success, false);
      assert.equal(validation.updateInquiryInput.safeParse({ ...fields, id, version: 1, status: 'NEW', replyContact: value }).success, false);
    }
  });
  await check('create persists canonical contact and excludes it from audit', async () => {
    assert.equal(await service.createInquiry(session, { ...create, replyContact: ' Inbox@Example.Invalid ' }), id);
    assert.equal(row.replyContact, 'inbox@example.invalid'); assert.equal(writes, 1);
    assert.equal(JSON.stringify(audit).includes('inbox'), false); assert.equal(JSON.stringify(audit).includes('replyContact'), false);
    assert.ok(permissionChecks.includes('LEAD_CREATE')); assert.ok(permissionChecks.includes('LEAD_VIEW'));
  });
  await check('same normalized contact replays; changed contact rejects reuse', async () => {
    await service.createInquiry(session, { ...create, replyContact: ' +1 (202) 555-0100 ' });
    assert.equal(await service.createInquiry(session, { ...create, replyContact: '+12025550100' }), id);
    await assert.rejects(service.createInquiry(session, { ...create, replyContact: 'new@example.invalid' }), /Повторный запрос/);
    assert.equal(writes, 1); assert.equal(audit.length, 1);
  });
  await check('old omitted-contact creation payload keeps its idempotency hash', async () => {
    await service.createInquiry(session, create);
    assert.equal(row.replyContact, null); assert.equal(row.creationHash, createHash('sha256').update(JSON.stringify(validation.createInquiryInput.parse(create))).digest('hex'));
    assert.equal(await service.createInquiry(session, create), id); assert.equal(writes, 1);
  });
  await check('another author cannot replay a contact-bearing creation', async () => {
    await seed(); await assert.rejects(service.createInquiry({ ...session, userId: other }, { ...create, replyContact: 'old@example.invalid' }), /Повторный запрос/);
    assert.equal(writes, 1);
  });
  await check('invalid contact fails before persistence on create and update', async () => {
    await assert.rejects(service.createInquiry(session, { ...create, replyContact: 'invalid' }), /телефон/); assert.equal(writes, 0);
    await seed(); await assert.rejects(service.updateInquiry(session, update('invalid')), /телефон/); assert.equal(writes, 1);
  });
  await check('edit, read and clear contact; absent field preserves existing value', async () => {
    await seed(); await service.updateInquiry(session, update(' New@Example.Invalid '));
    assert.equal((await service.getInquiry(session, id)).replyContact, 'new@example.invalid');
    await service.updateInquiry(session, { ...fields, id, version: row.version, status: 'NEW' });
    assert.equal(row.replyContact, 'new@example.invalid');
    await service.updateInquiry(session, update(' ')); assert.equal(row.replyContact, null);
    assert.equal(row.version, 4); assert.ok(permissionChecks.includes('LEAD_EDIT'));
    assert.equal(JSON.stringify(audit).includes('example.invalid'), false);
  });
  await check('stale form cannot overwrite contact', async () => {
    await seed(); const stale = update('stale@example.invalid'); await service.updateInquiry(session, update('new@example.invalid'));
    await assert.rejects(service.updateInquiry(session, stale), /уже изменено/);
    assert.equal(row.replyContact, 'new@example.invalid'); assert.equal(writes, 2); assert.equal(audit.length, 2);
  });
  await check('concurrent updateMany miss does not persist or audit', async () => {
    await seed(); conflict = true; await assert.rejects(service.updateInquiry(session, update('new@example.invalid')), /уже изменено/);
    assert.equal(row.replyContact, 'old@example.invalid'); assert.equal(writes, 1); assert.equal(audit.length, 1);
  });
  await check('cross-tenant and inaccessible-branch reads/edits fail', async () => {
    await seed(); const input = update('new@example.invalid');
    assert.equal(await service.getInquiry({ ...session, organizationId: other }, id), null);
    await assert.rejects(service.updateInquiry({ ...session, organizationId: other }, input), /недоступно/);
    branches = []; assert.equal(await service.getInquiry(session, id), null);
    await assert.rejects(service.updateInquiry(session, input), /недоступно/);
    await assert.rejects(service.createInquiry(session, { ...create, creationKey: other }), /branch denied/);
    assert.equal(row.replyContact, 'old@example.invalid'); assert.equal(writes, 1);
  });
  await check('VIEW, CREATE and EDIT permissions still guard contact operations', async () => {
    denied.add('LEAD_CREATE'); await assert.rejects(service.createInquiry(session, create), /permission denied/); assert.equal(writes, 0);
    denied.clear(); await seed(); denied.add('LEAD_EDIT'); await assert.rejects(service.updateInquiry(session, update('new@example.invalid')), /permission denied/);
    denied.clear(); denied.add('LEAD_VIEW'); await assert.rejects(service.getInquiry(session, id), /permission denied/);
    await assert.rejects(service.updateInquiry(session, update('new@example.invalid')), /permission denied/); assert.equal(writes, 1);
  });
  await check('real server action creates, edits and clears with authenticated scope', async () => {
    const redirect = error => error instanceof Redirect && error.url === `/chats/${id}`;
    await assert.rejects(saveInquiryAction(null, { error: null }, form({ ...create, replyContact: 'new@example.invalid' })), redirect);
    assert.equal(row.replyContact, 'new@example.invalid');
    await assert.rejects(saveInquiryAction(id, { error: null }, form(update('next@example.invalid'))), redirect);
    assert.equal(row.replyContact, 'next@example.invalid');
    await assert.rejects(saveInquiryAction(id, { error: null }, form({ ...fields, id, version: row.version, status: 'NEW' })), redirect);
    assert.equal(row.replyContact, 'next@example.invalid');
    await assert.rejects(saveInquiryAction(id, { error: null }, form(update(''))), redirect); assert.equal(row.replyContact, null);
    assert.equal(routeCalls, 4); assert.equal(revalidated.length, 8);
  });
  await check('server action rejects invalid contact without redirect/write', async () => {
    const result = await saveInquiryAction(null, { error: null }, form({ ...create, replyContact: 'invalid' }));
    assert.match(result.error, /телефон/); assert.equal(writes, 0); assert.equal(revalidated.length, 0);
  });
  await check('real form has optional labeled controlled contact on create and edit', () => {
    const props = { branchId: branch, timezone: 'Asia/Almaty', canAssign: false, canClose: false, assignees: [] };
    for (const initial of [undefined, { ...fields, status: 'NEW', replyContact: 'saved@example.invalid' }]) {
      const tree = InquiryForm({ ...props, id: initial ? id : null, initial }); const all = nodes(tree);
      const input = all.find(node => node.type === 'input' && node.props.name === 'replyContact');
      assert.ok(input); assert.equal(input.props.value, initial?.replyContact ?? ''); assert.equal(input.props.maxLength, 254);
      assert.equal(input.props.required, undefined); assert.equal(input.props.type, 'text');
      assert.ok(all.some(node => node.type === 'label' && nodes(node).includes(input)));
      assert.ok(all.some(node => node.props?.id === input.props['aria-describedby']));
    }
  });
  console.log(`Inquiry reply contact mock regression: ${passed}/${passed} scenarios passed; no real DB or external calls.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
