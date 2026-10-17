// Server configuration only. Never import this module into a client component.
// No target is configured by default. Values are entered only after separate approval.
export const ISOLATED_PROJECT = 'prj_FSsQxUktUBH9VNCGeadBoNnzlD1W';
export const ISOLATED_REF = 'review/ai-header-preview-candidate-20261011';
export const LIVE_RESOURCE = 'jawposhuxaexoqzopgoq';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Env = NodeJS.ProcessEnv;
export function isolatedPreviewRequested(env: Env = process.env) {
  return env.MARIPOSA_ISOLATED_PREVIEW !== undefined || env.VERCEL_GIT_COMMIT_REF === ISOLATED_REF;
}
export function isolatedPreviewConfig(env: Env = process.env, now = Date.now()) {
  if (env.MARIPOSA_ISOLATED_PREVIEW !== 'synthetic-history-v1' || env.VERCEL_ENV !== 'preview'
    || env.VERCEL_PROJECT_ID !== ISOLATED_PROJECT || env.VERCEL_GIT_COMMIT_REF !== ISOLATED_REF
    || env.MARIPOSA_ASSISTANT_ENABLED !== '0' || env.MARIPOSA_TEST_DB_BINDING !== ISOLATED_REF) return null;
  const resourceRef = env.MARIPOSA_TEST_DB_REF, organizationId = env.MARIPOSA_TEST_ORGANIZATION_ID;
  const host = env.MARIPOSA_TEST_DB_HOST, database = env.MARIPOSA_TEST_DB_NAME;
  if (!resourceRef || !/^[a-z]{20}$/.test(resourceRef) || resourceRef === LIVE_RESOURCE
    || !organizationId || !uuid.test(organizationId) || organizationId !== env.STOREFRONT_ORGANIZATION_ID
    || !host || !database || !/^[a-zA-Z0-9_]+$/.test(database)) return null;
  const direct = host === `db.${resourceRef}.supabase.co`;
  const pooler = /^aws-[0-9]+-[a-z]+-[a-z]+-[0-9]+\.pooler\.supabase\.com$/.test(host);
  if (!direct && !pooler) return null;
  const start = Date.parse(env.MARIPOSA_TEST_START ?? ''), until = Date.parse(env.MARIPOSA_TEST_UNTIL ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(until) || until <= start || until - start > 86400000 || now < start || now >= until) return null;
  return { resourceRef, organizationId, host, database, direct, until };
}
export function assertIsolatedDatabaseUrl(value: string, env: Env = process.env, now = Date.now()) {
  if (!isolatedPreviewRequested(env)) return;
  const config = isolatedPreviewConfig(env, now);
  // Never include the URL, username, password or parser error in diagnostics.
  const fail = () => { throw new Error('Isolated Preview database configuration is unavailable or mismatched.'); };
  if (!config) return fail();
  let url: URL; try { url = new URL(value); } catch { return fail(); }
  const user = config.direct ? 'postgres' : `postgres.${config.resourceRef}`;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== config.host
    || url.pathname !== `/${config.database}` || url.username !== user || !url.password
    || (url.port && url.port !== '5432') || url.hash
    || url.searchParams.get('sslmode') !== 'verify-full'
    || [...url.searchParams.keys()].some(key => key !== 'sslmode')
    || url.searchParams.getAll('sslmode').length !== 1) return fail();
}
export function isolatedHistoryEnabled(organizationId?: string, env: Env = process.env, now = Date.now()) {
  const config = isolatedPreviewConfig(env, now);
  if (!config || (organizationId !== undefined && config.organizationId !== organizationId)) return false;
  try { assertIsolatedDatabaseUrl(env.DATABASE_URL ?? '', env, now); return true; } catch { return false; }
}
