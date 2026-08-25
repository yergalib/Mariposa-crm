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
