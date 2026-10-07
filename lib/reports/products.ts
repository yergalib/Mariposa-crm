import "server-only";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { financeQueryScope, type FinanceRawFilters } from "@/lib/finance/filters";
import { hasPermission } from "@/lib/permissions/effective";
import { visibleFinanceEffects } from "@/lib/finance/read-visibility";

export type ProductReportFilters = Pick<FinanceRawFilters, "from" | "until" | "branchId"> & {
  type?: string; group?: string; sort?: string; q?: string; page?: string;
};
export async function getProductReport(actor: AuthContext, raw: ProductReportFilters) {
  const { where, scope, visibility, period } = await financeQueryScope(actor, { from: raw.from, until: raw.until, branchId: raw.branchId }, "REPORT_FINANCE_VIEW");
  if (raw.type && raw.type !== "RENTAL" && raw.type !== "SALE") throw new Error("Выберите аренду или продажу.");
  const type = raw.type === "SALE" ? "SALE" : "RENTAL", group = raw.group === "model" ? "model" : "size";
  const sort = raw.sort === "name" || raw.sort === "movements" ? raw.sort : "quantity";
  const search = (typeof raw.q === "string" ? raw.q : "").trim().slice(0, 100);
  const canInventory = await hasPermission(actor, "INVENTORY_VIEW"), canCatalog = await hasPermission(actor, "CATALOG_VIEW");
  const branchId = raw.branchId || scope.branchId;
  const movementType = type === "SALE" ? "SALE_ISSUE" : "RENTAL_ISSUE";
  const [issued, money] = await Promise.all([
    canInventory ? db.inventoryMovement.groupBy({ by: ["productVariantId"], where: {
      organizationId: actor.organizationId, type: movementType, fromBranchId: branchId,
      occurredAt: { gte: period.from, lt: period.endExclusive },
      ...(search ? { productVariant: { OR: [{ sku: { contains: search, mode: "insensitive" } }, { product: { name: { contains: search, mode: "insensitive" } } }, { size: { name: { contains: search, mode: "insensitive" } } }] } } : {}),
    }, _sum: { quantity: true }, _count: { _all: true } }) : [],
    visibility.hasRows ? db.financialTransaction.groupBy({ by: ["currency"], where: { AND: [where, { order: { organizationId: actor.organizationId, type } }] }, _sum: visibility.fields, _count: { _all: true } }) : [],
  ]);
  const variants = issued.length ? await db.productVariant.findMany({ where: { organizationId: actor.organizationId, id: { in: issued.map(row => row.productVariantId) } },
    select: { id: true, sku: true, productId: true, product: { select: { name: true } }, execution: { select: { name: true } }, size: { select: { name: true, code: true } } } }) : [];
  const byId = new Map(variants.map(row => [row.id, row]));
  const grouped = new Map<string, { id: string; productId: string; name: string; execution: string; size: string; sku: string; quantity: number; movements: number }>();
  for (const issue of issued) {
    const variant = byId.get(issue.productVariantId);
    if (!variant) continue;
    const id = group === "model" ? variant.productId : variant.id;
    const row = grouped.get(id) ?? { id, productId: variant.productId, name: variant.product.name,
      execution: group === "model" ? "Все исполнения" : variant.execution?.name ?? "", size: group === "model" ? "Все размеры" : variant.size.name || variant.size.code,
      sku: group === "model" ? "" : variant.sku, quantity: 0, movements: 0 };
    row.quantity += Math.abs(issue._sum.quantity ?? 0); row.movements += issue._count._all;
    grouped.set(id, row);
  }
  const rows = [...grouped.values()].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "ru") : sort === "movements" ? b.movements - a.movements : b.quantity - a.quantity) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(rows.length / 50)), requested = /^\d{1,7}$/.test(raw.page ?? "") ? Math.max(1, Number(raw.page)) : 1, page = Math.min(requested, pages);
  return { period, type, group, sort, search, movementType, canInventory, canCatalog, canMoney: visibility.hasRows,
    rows: rows.slice((page - 1) * 50, page * 50), total: rows.length, page, pages,
    totals: { quantity: rows.reduce((sum, row) => sum + row.quantity, 0), movements: rows.reduce((sum, row) => sum + row.movements, 0) },
    money: money.map(row => ({ currency: row.currency, count: row._count._all, ...visibleFinanceEffects(row._sum, visibility) })) };
}
