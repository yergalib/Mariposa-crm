// Existing execution/price contract only. All reads are synthetic; no database or network.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
// Match the existing pilot fixture; keep the real tenant restriction enabled.
const org = 'de1e9e01-c7ad-45fc-899a-d2287f771355', branch = id(2), productId = id(3);
process.env.STOREFRONT_ORGANIZATION_ID = org;
delete process.env.VERCEL_ENV;
const rows = [4, 5, 6].map((n, i) => ({
  id: id(n), productId, executionId: id(n + 10),
  product: { name: 'Synthetic model', color: null }, execution: { name: `Synthetic execution ${i}` },
  size: { name: '140', code: '140' },
  prices: i === 2 ? [] : [
    { amountMinor: BigInt((i + 1) * 1000), currency: 'KZT', branchId: null },
    ...(i === 0 ? [{ amountMinor: 2500n, currency: 'KZT', branchId: branch }] : [])
  ]
}));
const availabilityCalls = [];
function guard(where) {
  const first = where.AND[0];
  const q = first.organizationId ? first : first.AND[0];
  const { variantOperationWhere } = require('../lib/catalog/operation-policy.ts');
  assert.deepEqual(q, variantOperationWhere(org, 'RENTAL', true));
  assert.ok(JSON.stringify(q).includes('directShowOnWebsiteOverride'));
  assert.ok(JSON.stringify(q).includes('showOnWebsiteOverride'));

}
const db = {
  branch: { findFirst: async q => {
    assert.equal(q.where.organizationId, org); assert.equal(q.where.isPublic, true);
    return { timezone: 'Asia/Almaty' };
  } },
  productVariant: {
    groupBy: async q => {
      guard(q.where); assert.deepEqual(q.by, ['productId', 'executionId']);
      const selected = q.where.AND.find(part => part.id)?.id;
      return rows.filter(row => !selected || row.id === selected).map(({ productId, executionId }) => ({ productId, executionId }));
    },
    findMany: async q => {
      guard(q.where);
      if (!q.select.prices) {
        const selected = q.where.AND[1];
        return rows.filter(row => row.productId === selected.productId && row.executionId === selected.executionId);
      }
      const prices = q.select.prices;
      assert.equal(prices.where.organizationId, org); assert.equal(prices.where.type, 'RENTAL');
      assert.ok(prices.where.validFrom.lte instanceof Date);
      assert.equal(prices.where.AND[0].OR[0].validUntil, null);
      assert.ok(prices.where.AND[0].OR[1].validUntil.gt instanceof Date);
      assert.deepEqual(prices.where.AND[1].OR, [{ branchId: branch }, { branchId: null }]);
      assert.deepEqual(prices.orderBy, [{ validFrom: 'desc' }, { id: 'asc' }]);
      assert.deepEqual(prices.select, { amountMinor: true, currency: true, branchId: true });
      const selected = q.where.AND[1].OR;
      return rows.filter(row => selected.some(group => group.productId === row.productId && group.executionId === row.executionId));
    }
  }
};
const load = Module._load, resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.resolve(name.slice(2)) : name, ...args); };
Module._load = function(name, ...args) {
  if (name === 'server-only') return {};
  if (name === '@/lib/db') return { db };
  if (name === '@/lib/audit/log') return {};
  if (name === '@/lib/availability/capacity') return { getVariantAvailability: async q => {
    assert.equal(q.tenant.organizationId, org); assert.equal(q.branchId, branch);
    availabilityCalls.push(q.productVariantId);
    return { canFulfill: q.productVariantId !== rows[1].id };
  } };
  return load.call(this, name, ...args);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText, file);
(async () => {
  const { publicCatalog, publicProduct, publicSelection } = require('../lib/showroom/service.ts');
  const { browseHref } = require('../lib/showroom/navigation.ts');
  const criteria = { branchId: branch, from: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16), until: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16) };
  const catalog = await publicCatalog(criteria);
  assert.equal(catalog.items.length, 3);
  assert.equal(new Set(catalog.items.map(item => item.id)).size, 3);
  for (const [index, row] of rows.entries()) {
    const group = catalog.items[index];
    assert.equal(group.executionId, row.executionId);
    assert.deepEqual(group.variants.map(item => item.id), [row.id]);
    const selected = await publicSelection({ ...criteria, variantId: row.id });
    assert.equal(selected.price?.amountMinor ?? null, ['2500', '2000', null][index]);
    assert.equal(selected.available, index !== 1);
    assert.equal(selected.execution, row.execution.name);
    assert.deepEqual(Object.keys(selected).sort(), ['available', 'execution', 'id', 'name', 'price', 'size']);
    const detail = await publicProduct({ productId, executionId: row.executionId });
    assert.deepEqual(detail.options, [{ id: row.id, size: '140', sizeCode: '140' }]);
    const url = new URL(browseHref({ search: '', categoryId: '', page: 1 }, detail), 'https://example.invalid');
    assert.equal(url.searchParams.get('executionId'), row.executionId);
  }
  await assert.rejects(publicProduct({ productId, executionId: id(99) }), /./);
  assert.deepEqual(availabilityCalls.sort(), rows.flatMap(row => [row.id, row.id]).sort());
  assert.equal(require('../lib/showroom/release.ts').PUBLIC_INQUIRY_INTAKE_OPEN, false);
  console.log('PASS: same model/size, three executions keep distinct IDs, rental prices and shared availability; branch override, missing-price null, exact detail/link scope, narrow DTO and closed intake. Mock reads only; per-execution permissions NOT implemented.');
})().catch(error => { console.error(error); process.exitCode = 1; });
