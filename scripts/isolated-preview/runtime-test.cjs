const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '../..'), now = Date.now();
const target = 'abcdefghijklmnopqrst', org = 'a0172026-1017-4017-8017-000000000001';
const env = { VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: 'prj_FSsQxUktUBH9VNCGeadBoNnzlD1W',
  VERCEL_GIT_COMMIT_REF: 'review/ai-header-preview-candidate-20261011', MARIPOSA_ISOLATED_PREVIEW: 'synthetic-history-v1',
  MARIPOSA_ASSISTANT_ENABLED: '0', MARIPOSA_TEST_DB_BINDING: 'review/ai-header-preview-candidate-20261011',
  MARIPOSA_TEST_DB_REF: target, MARIPOSA_TEST_DB_HOST: `db.${target}.supabase.co`, MARIPOSA_TEST_DB_NAME: 'postgres',
  MARIPOSA_TEST_ORGANIZATION_ID: org, STOREFRONT_ORGANIZATION_ID: org,
  MARIPOSA_TEST_START: new Date(now - 1000).toISOString(), MARIPOSA_TEST_UNTIL: new Date(now + 3600000).toISOString(),
  DATABASE_URL: `postgresql://postgres:synthetic-only@db.${target}.supabase.co:5432/postgres?sslmode=verify-full`,
  OPENAI_API_KEY: 'synthetic-unusable', SUPABASE_URL: 'https://live.invalid', SUPABASE_SECRET_KEY: 'synthetic-unusable' };
// Execute actual modules with only synthetic environment and an instrumented DB.
// No loader path may connect, import credentials or invoke a model.
function modules(environment) {
  const cache = new Map(); let dbReads = 0;
  const db = { $queryRaw: async () => { dbReads++; return []; }, $transaction: async () => { throw Error('UNEXPECTED_WRITE'); } };
  function load(file) {
    file = path.posix.normalize(file); if (cache.has(file)) return cache.get(file);
    if (file === 'lib/showroom/service.ts') return { ShowroomError: class extends Error {} };
    const m = { exports: {} }; cache.set(file, m.exports);
    const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext('(function(require,module,exports){' + source + '\n})', { process: { env: environment }, Date, URL, console, Buffer, Intl, Request, Response, TextEncoder, setTimeout, clearTimeout })(name => {
      if (name === 'server-only') return {};
      if (name === '@/lib/db') return { db };
      if (name === '@/lib/inquiries/record') return { createInquiryRecord: () => { throw Error('UNEXPECTED_WRITE'); } };
      if (name === '@/lib/inquiries/service') return { getInquiry: async () => { dbReads++; return null; } };
      if (name === '@/lib/auth/session') return { getCurrentSession: async () => null };
      if (name === '@/lib/showroom/service') return { ShowroomError: class extends Error {} };
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      if (name.startsWith('.')) return load(path.posix.join(path.posix.dirname(file), name) + '.ts');
      if (name === 'node:crypto' || name === 'zod' || name === 'next/server') return require(name);
      throw Error('Unapproved dependency ' + name);
    }, m, m.exports); return m.exports;
  }
  return { load, reads: () => dbReads };
}
const checks = [];
function check(name, action) { action(); checks.push(name); }
(async () => {
  const m = modules(env), policy = m.load('lib/assistant/isolated-preview.ts'), config = m.load('lib/env.ts');
  check('configured direct test target accepted; storage suppressed', () => {
    assert(policy.isolatedHistoryEnabled(org)); assert.equal(config.getDatabaseUrl(), env.DATABASE_URL); assert.equal(config.getSupabaseStorageConfig(), null);
  });
  check('session pooler binds username to test project and retains TLS', () => {
    const e = { ...env, MARIPOSA_TEST_DB_HOST: 'aws-0-ap-south-1.pooler.supabase.com' };
    e.DATABASE_URL = `postgresql://postgres.${target}:synthetic-only@${e.MARIPOSA_TEST_DB_HOST}:5432/postgres?sslmode=verify-full`;
    assert(policy.isolatedHistoryEnabled(org, e));
    assert(!policy.isolatedHistoryEnabled(org, { ...e, DATABASE_URL: e.DATABASE_URL.replace(target, 'jawposhuxaexoqzopgoq') }));
  });
  const bad = [ { VERCEL_ENV: 'production' }, { VERCEL_PROJECT_ID: 'other' }, { VERCEL_GIT_COMMIT_REF: 'main' },
    { VERCEL_GIT_COMMIT_REF: 'review/website-current-20261009' }, { MARIPOSA_TEST_DB_BINDING: '' },
    { MARIPOSA_TEST_DB_REF: 'jawposhuxaexoqzopgoq' }, { MARIPOSA_TEST_DB_HOST: 'db.jawposhuxaexoqzopgoq.supabase.co' },
    { STOREFRONT_ORGANIZATION_ID: 'a0172026-1017-4017-8017-000000000002' }, { MARIPOSA_ASSISTANT_ENABLED: '1' },
    { MARIPOSA_TEST_UNTIL: new Date(now - 1).toISOString() }, { MARIPOSA_TEST_UNTIL: new Date(now + 86400001).toISOString() },
    { DATABASE_URL: env.DATABASE_URL.replace('verify-full', 'disable') }, { DATABASE_URL: env.DATABASE_URL + '&host=live.invalid' },
    { DATABASE_URL: env.DATABASE_URL.replace('/postgres?', '/other?') }, { DATABASE_URL: env.DATABASE_URL.replace('5432', '6543') },
    { DATABASE_URL: env.DATABASE_URL.replace('synthetic-only', '') }, { MARIPOSA_ISOLATED_PREVIEW: undefined } ];
  for (const [i, patch] of bad.entries()) check('invalid configuration denied before DB connection ' + i, () => {
    const e = { ...env, ...patch }, denied = modules(e); assert(!policy.isolatedHistoryEnabled(org, e));
    assert.throws(() => denied.load('lib/env.ts').getDatabaseUrl(), /Isolated Preview database/);
    assert.equal(denied.reads(), 0);
  });
  check('normal stable configuration retains closed history and existing DB handling', () => {
    const stable = modules({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'review/website-current-20261009', DATABASE_URL: 'postgresql://synthetic@127.0.0.1:1/synthetic' });
    assert.equal(stable.load('lib/env.ts').getDatabaseUrl(), 'postgresql://synthetic@127.0.0.1:1/synthetic');
    assert.equal(stable.load('lib/assistant/history/access.ts').historyEnabled(org), false);
  });
  check('real model owner gate remains closed despite inherited key', () => assert.equal(m.load('lib/assistant/chat/owner-test.ts').ownerTestConfig(env), null));
  const service = m.load('lib/assistant/history/service.ts');
  const owner = { organizationId: org, ownerHash: 'a'.repeat(64), principal: 'guest' };
  assert.equal(await service.readHistory(owner), null); assert.equal(m.reads(), 1); checks.push('actual history service allows matching configured test tenant');
  for (const action of [() => service.readHistory({ ...owner, organizationId: 'foreign' }), () => service.writeHistory({ ...owner, organizationId: 'foreign' }, {}), () => service.revokeHistory({ ...owner, organizationId: 'foreign' })]) await assert.rejects(action, e => e.status === 503);
  assert.equal(m.reads(), 1); checks.push('foreign tenant denied before service query/write');
  await assert.rejects(() => service.retentionBatch(true), e => e.status === 503); checks.push('global retention cannot sweep isolated database');
  const access = m.load('lib/assistant/history/access.ts'); assert(access.historyEnabled(org)); assert(access.historyHandoffEnabled(org));
  assert.equal(m.load('lib/showroom/release.ts').PUBLIC_INQUIRY_INTAKE_OPEN, false); checks.push('history handoff enabled without opening generic intake');
  const route = m.load('app/api/showroom/history/route.ts');
  const response = await route.GET(new Request('https://synthetic.invalid/api/showroom/history'));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { history: null, ownershipReady: false });
  checks.push('actual route enables guest bootstrap without creating history');
  const denied = modules({ ...env, VERCEL_ENV: 'production' });
  assert.equal((await denied.load('app/api/showroom/history/route.ts').GET(new Request('https://synthetic.invalid/api/showroom/history'))).status, 503);
  assert.equal(denied.reads(), 0); checks.push('actual route rejects Production before auth/database read');
  console.log(JSON.stringify({ status: 'OFFLINE_PASS', checks, networkCalls: 0, writes: 0, realCredentials: false }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
