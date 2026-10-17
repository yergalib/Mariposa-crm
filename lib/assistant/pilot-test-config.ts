// One explicitly approved run. These identifiers are not credentials.
export const PILOT_TEST = {
  project: 'prj_FSsQxUktUBH9VNCGeadBoNnzlD1W', ref: 'review/ai-header-preview-candidate-20261011',
  resource: 'jawposhuxaexoqzopgoq', organizationId: 'de1e9e01-c7ad-45fc-899a-d2287f771355',
  membershipId: '79b6a6cd-98f1-4cb9-8bc5-4285ab70bbc1', branchId: '029dac34-94d7-490d-9047-0e198d8785ff',
  runId: 'bed4af3c-e615-46e4-9f17-139bb156a849', contact: 'e2e-pilot-20261017@example.invalid',
  productId: '2fbba7d2-eb25-565e-8b3d-bc4c50a232ea', variantId: 'b574b3bd-dc17-5f42-8008-3c4d00d7ac05',
  durationMs: 30 * 60_000,
} as const;
export function pilotTestRequested(env: NodeJS.ProcessEnv = process.env) { return env.MARIPOSA_PILOT_HISTORY_TEST !== undefined; }
export function pilotTestConfigured(env: NodeJS.ProcessEnv = process.env) {
  return env.MARIPOSA_PILOT_HISTORY_TEST === '1' && env.MARIPOSA_PILOT_TEST_RUN_ID === PILOT_TEST.runId
    && env.VERCEL_ENV === 'preview' && env.VERCEL_PROJECT_ID === PILOT_TEST.project
    && env.VERCEL_GIT_COMMIT_REF === PILOT_TEST.ref && env.STOREFRONT_ORGANIZATION_ID === PILOT_TEST.organizationId
    && env.MARIPOSA_ASSISTANT_ENABLED === '0' && env.MARIPOSA_ISOLATED_PREVIEW === undefined;
}
export function assertPilotDatabaseUrl(value: string, env: NodeJS.ProcessEnv = process.env) {
  const fail = () => { throw new Error('Pilot test database binding is unavailable or mismatched.'); };
  if (!pilotTestConfigured(env)) return fail();
  let url: URL; try { url = new URL(value); } catch { return fail(); }
  const direct = url.hostname === `db.${PILOT_TEST.resource}.supabase.co` && url.username === 'postgres';
  const pooled = /^aws-[0-9]+-[a-z]+-[a-z]+-[0-9]+\.pooler\.supabase\.com$/.test(url.hostname) && url.username === `postgres.${PILOT_TEST.resource}`;
  const allowed = new Set(['sslmode','pgbouncer','connection_limit','connect_timeout','pool_timeout','application_name']);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!direct && !pooled) || !url.password
    || url.pathname !== '/postgres' || (url.port && url.port !== '5432') || url.hash
    || !['require','verify-ca','verify-full'].includes(url.searchParams.get('sslmode') ?? '')
    || url.searchParams.getAll('sslmode').length !== 1 || [...url.searchParams.keys()].some(key => !allowed.has(key))) return fail();
}
