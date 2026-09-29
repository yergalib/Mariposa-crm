const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

export function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error(
      "DATABASE_URL is required. Copy .env.example to .env and provide a PostgreSQL connection string."
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new Error("DATABASE_URL must use the postgres:// or postgresql:// protocol.");
  }

  return value;
}

// Vercel functions are short-lived. Supavisor's session endpoint reserves a
// backend for each client and can exhaust its small pool across instances.
// Prisma CLI keeps using DATABASE_URL (session/direct), while application
// traffic uses Supavisor transaction mode when given its session endpoint.
export function getRuntimeDatabaseUrl(): string {
  const value = getDatabaseUrl();
  if (!process.env.VERCEL) return value;

  const url = new URL(value);
  if (!/(^|\.)pooler\.supabase\.com$/i.test(url.hostname)) return value;
  if (url.port === "5432") url.port = "6543";
  if (url.port === "6543") url.searchParams.set("pgbouncer", "true");
  return url.toString();
}

export function getSupabaseStorageConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !secretKey) return null;
  let normalizedUrl: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    normalizedUrl = parsed.origin;
  } catch {
    return null;
  }
  return { url: normalizedUrl, secretKey };
}
