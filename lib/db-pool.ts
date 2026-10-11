import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions/db-connections";

// Per process, not a global cap. The existing session pool has 15 slots shared
// across function instances and other clients. Keep room for concurrent work
// without allowing each warm instance to consume node-postgres's default 10.
export const DATABASE_POOL_OPTIONS = {
  max: 2,
  min: 0,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 5_000,
} as const;

export function createDatabasePool(connectionString: string) {
  // Preserve the existing endpoint and TLS options in DATABASE_URL unchanged.
  const pool = new Pool({
    connectionString, ...DATABASE_POOL_OPTIONS,
    // PrismaPg serializes Date without an offset and normalizes timestamptz as UTC.
    // pg awaits onConnect before lending each new connection, including replacements.
    // Session-only: preserve URL/TLS options and never alter database/role settings.
    onConnect: async client => { await client.query("SET TIME ZONE 'UTC'"); },
  });
  // Keep idle cleanup alive before Fluid Compute suspends an invocation.
  // No-op outside Vercel's request context; normal pg idle cleanup still runs.
  attachDatabasePool(pool);
  return pool;
}
