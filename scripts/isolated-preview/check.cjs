const assert = require('node:assert/strict');
require('tsx/cjs');
const { syntheticSeed } = require('./seed.ts');
const seed = syntheticSeed(), organizationId = seed.organizations[0].id;
assert.equal(seed.prices[0].amountMinor, 18000n);
assert.equal(seed.prices[1].amountMinor, 12000n);
for (const v of seed.variants) {
  assert(seed.products.some(p => p.id === v.productId && p.organizationId === v.organizationId));
  assert(seed.sizes.some(s => s.id === v.sizeId && s.organizationId === v.organizationId));
}
assert.equal(seed.products.filter(p => p.organizationId === organizationId && p.showOnWebsite).length, 2);
assert(seed.products.some(p => !p.showOnWebsite));
console.log('PASS typed synthetic seed relationships, tenant boundaries and catalogue prices');
// Test the actual runtime policy, not a second preparation-only implementation.
require('./runtime-test.cjs');
