import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;
type TableBaseline = { count: number; sha256: string };

export type CatalogBusinessBaseline = {
  version: 1;
  orders: TableBaseline;
  purchases: TableBaseline;
  financialTransactions: TableBaseline;
};

async function readTableBaseline(db: Db, table: "orders" | "purchases" | "financial_transactions", organizationId: string): Promise<TableBaseline> {
  const rows = await db.$queryRawUnsafe<Array<{ payload: string }>>(
    `SELECT row_to_json(t)::text AS payload FROM (SELECT * FROM public.${table} WHERE organization_id = $1::uuid ORDER BY id) t`,
    organizationId,
  );
  const hash = createHash("sha256");
  for (const row of rows) hash.update(row.payload).update("\n");
  return { count: rows.length, sha256: hash.digest("hex").toUpperCase() };
}

export async function readCatalogBusinessBaseline(db: Db, organizationId: string): Promise<CatalogBusinessBaseline> {
  // Sequential reads avoid adding connection pressure to the Supabase session pool.
  const orders = await readTableBaseline(db, "orders", organizationId);
  const purchases = await readTableBaseline(db, "purchases", organizationId);
  const financialTransactions = await readTableBaseline(db, "financial_transactions", organizationId);
  return { version: 1, orders, purchases, financialTransactions };
}

export function catalogBusinessBaselineEquals(left: CatalogBusinessBaseline, right: CatalogBusinessBaseline) {
  return left.version === right.version
    && left.orders.count === right.orders.count && left.orders.sha256 === right.orders.sha256
    && left.purchases.count === right.purchases.count && left.purchases.sha256 === right.purchases.sha256
    && left.financialTransactions.count === right.financialTransactions.count
    && left.financialTransactions.sha256 === right.financialTransactions.sha256;
}

export function parseCatalogBusinessBaseline(value: unknown): CatalogBusinessBaseline | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<CatalogBusinessBaseline>;
  const valid = (entry: unknown): entry is TableBaseline => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const row = entry as Partial<TableBaseline>;
    return Number.isInteger(row.count) && Number(row.count) >= 0 && typeof row.sha256 === "string" && /^[A-F0-9]{64}$/.test(row.sha256);
  };
  return candidate.version === 1 && valid(candidate.orders) && valid(candidate.purchases) && valid(candidate.financialTransactions)
    ? candidate as CatalogBusinessBaseline
    : null;
}
