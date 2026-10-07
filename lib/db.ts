import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/env";
import { createDatabasePool } from "@/lib/db-pool";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const pool = createDatabasePool(getDatabaseUrl());
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

// Reuse the same client even if a server bundle evaluates this module again.
// Never disconnect after an individual request: concurrent work shares this pool.
globalForPrisma.prisma = db;
