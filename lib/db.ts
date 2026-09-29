import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  // Vercel may keep several warm Node processes alive at once. The pg driver
  // defaults to ten connections per process, which is unsafe for the small
  // Supabase pool used by this application. Queue concurrent work inside the
  // process and leave cross-instance multiplexing to the configured external pooler.
  const adapter = new PrismaPg({
    connectionString: getDatabaseUrl(),
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = db;
