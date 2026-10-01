// Real services/permission resolver, allowlisted in-memory dependencies only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const crypto = require('node:crypto');
const org = '11111111-1111-4111-8111-111111111111', branch = '22222222-2222-4222-8222-222222222222';
const tenant = { organizationId: org }, actor = { membershipId: 'synthetic-member', userId: 'synthetic-user', role: 'SELLER' };
let overrides = [], branchAllowed = true, reads = 0, transactions = 0;
const reachedTransaction = new Error('mock transaction reached');
const db = {
  organizationMembership: { findFirst: async ({ where }) => {
    assert.equal(where.organizationId, org); assert.equal(where.id, actor.membershipId); assert.equal(where.status, 'ACTIVE');
    return { role: actor.role, permissionOverrides: overrides };
  } },
  branch: { findFirst: async ({ where }) => { reads++; assert.equal(where.organizationId, org); assert.equal(where.id, branch); return { timezone: 'Asia/Almaty' }; } },
  productVariant: { findMany: async ({ where }) => { reads++; assert.equal(where.organizationId, org); return []; } },
  $transaction: async () => { transactions++; throw reachedTransaction; },
};
const allowed = new Set(['lib/whatsapp/inquiry.ts', 'lib/permissions/effective.ts', 'lib/permissions/registry.ts',
  'lib/calendar/timezone.ts', 'lib/finance/transactions.ts', 'lib/finance/effects.ts', 'lib/finance/errors.ts',
  'lib/fulfillment/rental-payment.ts', 'lib/fulfillment/errors.ts', 'lib/sales/fulfillment-payment.ts', 'lib/orders/errors.ts']);
const stubs = {
  'server-only': {}, react: { cache: fn => fn }, 'node:crypto': crypto,
  '@/lib/db': { db }, '@/lib/availability/capacity': { getVariantAvailability: () => { throw new Error('unexpected availability call'); } },
  '@/lib/catalog/images': { getSignedProductImageRenditionUrl: () => { throw new Error('unexpected storage call'); } },
  '@/lib/staff/branch-access': { canAccessBranch: async (scope, membershipId, branchId) => {
    assert.equal(scope.organizationId, org); assert.equal(membershipId, actor.membershipId); assert.equal(branchId, branch); return branchAllowed;
  } },
  '@/lib/audit/log': {}, '@/lib/finance/order-lock': {},
};
const cache = new Map();
function load(file) {
  assert.ok(allowed.has(file), `Source not allowlisted: ${file}`); if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} }, code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const localRequire = name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    const base = name.startsWith('@/') ? name.slice(2) : name.startsWith('.') ? path.posix.join(path.posix.dirname(file), name) : null;
    assert.ok(base, `Dependency not allowlisted: ${name}`); return load(`${base}.ts`);
  };
  vm.runInNewContext('(function(require,module,exports){' + code + '\n})', { Date, console }, { filename: file })(localRequire, loaded, loaded.exports);
  cache.set(file, loaded.exports); return loaded.exports;
}
const { lookupRentalInquiry } = load('lib/whatsapp/inquiry.ts');
const { withholdDeposit } = load('lib/finance/transactions.ts');
const { effectsFor } = load('lib/finance/effects.ts');
const { assertRentalIssuePaid } = load('lib/fulfillment/rental-payment.ts');
const { assertSaleFulfillmentPaid } = load('lib/sales/fulfillment-payment.ts');
const query = { branchId: branch, search: 'synthetic', size: '', from: '2026-10-01T12:00', until: '2026-10-02T12:00' };
let passed = 0;
async function check(name, run) { overrides = []; branchAllowed = true; reads = 0; transactions = 0; await run(); passed++; console.log(`PASS ${name}`); }
async function main() {
  await check('WhatsApp lookup respects explicit catalog and inventory denies', async () => {
    for (const permissionKey of ['CATALOG_VIEW', 'INVENTORY_VIEW']) {
      overrides = [{ permissionKey, effect: 'DENY' }];
      await assert.rejects(lookupRentalInquiry(tenant, actor, query), /Недостаточно прав/);
      assert.equal(reads, 0, 'no catalog/branch/availability reads after deny');
    }
  });
  await check('authorized lookup still works and rejects inaccessible branch', async () => {
    assert.equal((await lookupRentalInquiry(tenant, actor, query)).length, 0); assert.equal(reads, 2);
    reads = 0; branchAllowed = false;
    await assert.rejects(lookupRentalInquiry(tenant, actor, query), /Филиал недоступен/); assert.equal(reads, 0);
  });
  await check('deposit receipt permission cannot grant deposit withholding', async () => {
    overrides = [{ permissionKey: 'DEPOSIT_MANAGE', effect: 'ALLOW' }, { permissionKey: 'DEPOSIT_WITHHOLD', effect: 'DENY' }];
    const input = { branchId: branch, amountMinor: 1n, currency: 'KZT', sourceType: 'MOCK', idempotencyKey: 'mock-withhold' };
    await assert.rejects(withholdDeposit(tenant, 'mock-original', input, actor), /Недостаточно прав/);
    assert.equal(transactions, 0);
    overrides = [{ permissionKey: 'DEPOSIT_MANAGE', effect: 'DENY' }, { permissionKey: 'DEPOSIT_WITHHOLD', effect: 'ALLOW' }];
    await assert.rejects(withholdDeposit(tenant, 'mock-original', input, actor), error => error === reachedTransaction);
    assert.equal(transactions, 1, 'dedicated withholding permission reaches only the mock transaction boundary');
  });
  await check('all ledger effects satisfy cash/deposit/revenue/obligation conservation', () => {
    const expected = {
      RENTAL_CHARGE: [100n, 0n, 100n, 0n], SALE_CHARGE: [100n, 0n, 100n, 0n], DAMAGE_CHARGE: [100n, 0n, 100n, 0n],
      DISCOUNT: [-100n, 0n, -100n, 0n], PAYMENT_RECEIVED: [-100n, 100n, 0n, 0n], CUSTOMER_REFUND: [100n, -100n, 0n, 0n],
      DEPOSIT_RECEIVED: [0n, 100n, 0n, 100n], DEPOSIT_REFUNDED: [0n, -100n, 0n, -100n], DEPOSIT_WITHHELD: [-100n, 0n, 0n, -100n],
    };
    for (const [kind, tuple] of Object.entries(expected)) {
      const e = effectsFor(kind, 100n);
      assert.deepEqual([e.obligationEffectMinor, e.cashEffectMinor, e.revenueEffectMinor, e.depositEffectMinor], tuple);
      assert.equal(e.revenueEffectMinor - e.obligationEffectMinor, e.cashEffectMinor - e.depositEffectMinor);
    }
  });
  await check('advance/topup, deposit refund and damage withholding remain separate', () => {
    const ledger = [['RENTAL_CHARGE', 100n], ['PAYMENT_RECEIVED', 30n], ['PAYMENT_RECEIVED', 70n],
      ['DEPOSIT_RECEIVED', 50n], ['DEPOSIT_REFUNDED', 20n], ['DAMAGE_CHARGE', 10n], ['DEPOSIT_WITHHELD', 10n]];
    const total = ledger.map(([kind, amount]) => effectsFor(kind, amount)).reduce((sum, row) => {
      for (const key of Object.keys(sum)) sum[key] += row[key]; return sum;
    }, { obligationEffectMinor: 0n, cashEffectMinor: 0n, revenueEffectMinor: 0n, depositEffectMinor: 0n });
    assert.deepEqual(total, { obligationEffectMinor: 0n, cashEffectMinor: 130n, revenueEffectMinor: 110n, depositEffectMinor: 20n });
  });
  await check('rental and sale handover allow exactly zero debt', () => {
    for (const guard of [assertRentalIssuePaid, assertSaleFulfillmentPaid]) {
      assert.doesNotThrow(() => guard(0n, 'KZT'));
      assert.throws(() => guard(1n, 'KZT')); assert.throws(() => guard(-1n, 'KZT'));
      // Receiving only a deposit must not make an unpaid charge eligible for handover.
      const debt = effectsFor('RENTAL_CHARGE', 100n).obligationEffectMinor + effectsFor('DEPOSIT_RECEIVED', 100n).obligationEffectMinor;
      assert.throws(() => guard(debt, 'KZT'));
    }
  });
  console.log(`CRM permission/finance mock regression: ${passed}/${passed} passed; no real financial operations.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
