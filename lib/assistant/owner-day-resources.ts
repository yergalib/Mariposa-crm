import { OWNER_DAY, ownerDayConfig } from './owner-day-config';

// Resource binding is additional to, never a replacement for, request/session guards.
export function assertOwnerDayDatabaseUrl(value: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  const fail = () => { throw new Error('Owner day database configuration is unavailable or mismatched.'); };
  if (!ownerDayConfig(env, now)) return fail();
  let url: URL; try { url = new URL(value); } catch { return fail(); }
  const direct = url.hostname === `db.${OWNER_DAY.resource}.supabase.co` && url.username === 'postgres';
  const pooled = /^aws-[0-9]+-[a-z]+-[a-z]+-[0-9]+\.pooler\.supabase\.com$/.test(url.hostname)
    && url.username === `postgres.${OWNER_DAY.resource}`;
  const allowed = new Set(['sslmode', 'pgbouncer', 'connection_limit', 'connect_timeout', 'pool_timeout', 'application_name']);
  const modes = url.searchParams.getAll('sslmode');
  // Preserve the existing approved connection options; reject explicit TLS downgrades.
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!direct && !pooled) || !url.password
    || url.pathname !== '/postgres' || (url.port && url.port !== '5432') || url.hash
    || modes.length > 1 || (modes.length === 1 && !['require', 'verify-ca', 'verify-full'].includes(modes[0]))
    || [...url.searchParams.keys()].some(key => !allowed.has(key))) return fail();
}

export function ownerDayStorageConfig(env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  if (!ownerDayConfig(env, now)) return null;
  try { assertOwnerDayDatabaseUrl(env.DATABASE_URL?.trim() ?? '', env, now); } catch { return null; }
  const value = env.SUPABASE_URL?.trim();
  const secretKey = (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!value || !secretKey) return null;
  let url: URL; try { url = new URL(value); } catch { return null; }
  if (url.origin !== `https://${OWNER_DAY.resource}.supabase.co` || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) return null;
  return { url: url.origin, secretKey };
}
