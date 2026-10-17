const assert = require('node:assert/strict');
require('tsx/cjs');
const { PROJECT, REF, KNOWN_LIVE_RESOURCE, previewGates } = require('./policy.ts');
const { syntheticSeed } = require('./seed.ts');
const manifest = require('../../docs/isolated-preview-candidate-20261017.json');
const now = Date.parse('2026-10-17T12:30:00Z');
const seed = syntheticSeed();
const evidence = { approved: true, syntheticOnly: true, resourceRef: 'abcdefghijklmnopqrst', organizationId: seed.organizations[0].id,
  ownerMembershipId: 'a0172026-1017-4017-8017-000000000090', databaseHost: 'db.abcdefghijklmnopqrst.supabase.co', databaseName: 'postgres',
  databaseVariableBranch: REF, storageDisabled: true, verifiedAt: '2026-10-17T12:00:00Z', expiresAt: '2026-10-17T13:00:00Z' };
const scope = { environment: 'preview', projectId: PROJECT, branch: REF, organizationId: evidence.organizationId,
  databaseHost: evidence.databaseHost, databaseName: 'postgres', assistantEnabled: '0' };
let checks = 0;
function closed(s = scope, e = evidence, time = now) {
  assert.deepEqual(previewGates(s, e, time), { history: false, handoff: false, publicIntake: false, llm: false }); checks++;
}
assert.deepEqual(previewGates(scope, evidence, now), { history: true, handoff: true, publicIntake: false, llm: false }); checks++;
closed(scope, null); closed(scope, manifest.isolationEvidence);
for (const patch of [{ environment: 'production' }, { environment: 'development' }, { projectId: 'another' },
  { branch: 'review/website-current-20261009' }, { branch: 'main' }, { organizationId: seed.organizations[1].id },
  { databaseHost: `db.${KNOWN_LIVE_RESOURCE}.supabase.co` }, { databaseName: 'another' }, { assistantEnabled: '1' }]) closed({ ...scope, ...patch });
for (const patch of [{ approved: false }, { syntheticOnly: false }, { storageDisabled: false },
  { databaseVariableBranch: '' }, { databaseVariableBranch: 'review/website-current-20261009' },
  { resourceRef: KNOWN_LIVE_RESOURCE }, { resourceRef: '' }, { ownerMembershipId: '' },
  { expiresAt: 'invalid' }, { expiresAt: '2026-10-19T12:00:00Z' }]) closed(scope, { ...evidence, ...patch });
closed(scope, evidence, Date.parse(evidence.expiresAt)); closed(scope, evidence, Date.parse(evidence.verifiedAt) - 1);
assert.equal(seed.prices[0].amountMinor, 18000n); assert.equal(seed.prices[1].amountMinor, 12000n);
for (const v of seed.variants) {
  assert(seed.products.some(p => p.id === v.productId && p.organizationId === v.organizationId));
  assert(seed.sizes.some(s => s.id === v.sizeId && s.organizationId === v.organizationId));
}
assert.equal(seed.products.filter(p => p.organizationId === scope.organizationId && p.showOnWebsite).length, 2);
assert(seed.products.some(p => !p.showOnWebsite)); checks++;
console.log(JSON.stringify({ status: 'OFFLINE_PASS', checks, networkCalls: 0, databaseWrites: 0,
  candidateReadyToDeploy: false, limitation: 'Preparation policy and typed seed plan only; production gates remain closed.' }, null, 2));
