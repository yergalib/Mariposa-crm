import "server-only";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import type { TenantContext } from "@/lib/tenant/context";
import { hasPermission, requirePermission, PermissionError } from "@/lib/permissions/effective";
import { accessibleBranchIds } from "@/lib/staff/branch-access";
import type { Prisma } from "@/generated/prisma/client";

const statuses = ["DRAFT", "CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"] as const;
export type PurchaseReportFilters = { from?: string; to?: string; branchId?: string; status?: typeof statuses[number] };
export class PurchaseReportError extends Error {
  constructor(public status: 400 | 409 | 413, message: string) { super(message); this.name = "PurchaseReportError"; }
}
const invalid = () => new PurchaseReportError(400, "Проверьте даты, статус и филиал отчёта.");
function day(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === "0000") throw invalid();
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw invalid();
  return date;
}
export function readPurchaseReportFilters(params: URLSearchParams): PurchaseReportFilters {
  const allowed = ["from", "to", "branchId", "status"];
  const result: Record<string, string> = {};
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) throw invalid();
    const value = params.get(key)!;
    if (value) result[key] = value;
  }
  if (result.from) day(result.from);
  if (result.to) day(result.to);
  if (result.from && result.to && result.from > result.to) throw invalid();
  if (result.branchId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.branchId)) throw invalid();
  if (result.status && !statuses.includes(result.status as typeof statuses[number])) throw invalid();
  return result as PurchaseReportFilters;
}

type Actor = Pick<AuthContext, "organizationId" | "membershipId" | "role">;
/** Read-only document/receipt report. Purchase costs are not cash expenses or revenue. */
export async function getPurchaseReport(tenant: TenantContext, actor: Actor, filters: PurchaseReportFilters) {
  if (actor.organizationId !== tenant.organizationId) throw new PermissionError();
  await requirePermission(actor, "PURCHASE_VIEW");
  await requirePermission(actor, "REPORT_FINANCE_VIEW");
  const branches = await accessibleBranchIds(tenant, actor.membershipId);
  if (filters.branchId && branches && !branches.includes(filters.branchId)) throw new PermissionError("Филиал недоступен.");
  const costVisible = await hasPermission(actor, "FINANCE_PURCHASE_COST_VIEW");
  const where: Prisma.PurchaseWhereInput = {
    organizationId: tenant.organizationId,
    destinationBranchId: filters.branchId ?? (branches ? { in: branches } : undefined),
    destinationBranch: { organizationId: tenant.organizationId },
    supplier: { organizationId: tenant.organizationId },
    status: filters.status,
    createdAt: {
      ...(filters.from ? { gte: day(filters.from) } : {}),
      ...(filters.to ? { lt: new Date(day(filters.to).getTime() + 86400000) } : {}),
    },
  };
  return db.$transaction(async tx => {
    const documents = await tx.purchase.findMany({ where, take: 5001, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: {
      id: true, purchaseNumber: true, status: true, currency: true, createdAt: true, destinationBranchId: true,
      supplier: { select: { name: true } }, destinationBranch: { select: { name: true } },
      ...(costVisible ? { totalMinor: true } : {}),
    } });
    if (documents.length > 5000) throw new PurchaseReportError(413, "В отчёте больше 5000 закупок. Уточните период или фильтр.");
    const ids = documents.map(row => row.id);
    const items = ids.length ? await tx.purchaseItem.findMany({ where: { organizationId: tenant.organizationId, purchaseId: { in: ids } },
      take: 20001, orderBy: [{ purchaseId: "asc" }, { sortOrder: "asc" }, { id: "asc" }], select: {
        id: true, purchaseId: true, orderedQuantity: true, currency: true,
        productNameSnapshot: true, variantNameSnapshot: true, skuSnapshot: true,
        ...(costVisible ? { unitCostMinor: true, lineTotalMinor: true } : {}),
      } }) : [];
    if (items.length > 20000) throw new PurchaseReportError(413, "В отчёте больше 20000 позиций. Уточните период или фильтр.");
    const receipts = items.length ? await tx.purchaseReceiptLine.findMany({ where: {
      organizationId: tenant.organizationId, purchaseItemId: { in: items.map(row => row.id) },
      purchaseReceipt: { organizationId: tenant.organizationId },
    }, take: 100001, orderBy: { id: "asc" }, select: {
      purchaseItemId: true, quantity: true, currency: true,
      purchaseReceipt: { select: { purchaseId: true, branchId: true } },
      ...(costVisible ? { totalAcquisitionCostMinor: true } : {}),
    } }) : [];
    if (receipts.length > 100000) throw new PurchaseReportError(413, "В отчёте больше 100000 строк приёмки. Уточните период или фильтр.");
    const byDocument = new Map(documents.map(row => [row.id, row]));
    const byItem = new Map(items.map(row => [row.id, row]));
    const received = new Map<string, { quantity: number; cost: bigint }>();
    const inconsistent = () => new PurchaseReportError(409, "Данные закупки и приёмки не согласованы. Отчёт не сформирован.");
    for (const line of receipts) {
      const item = byItem.get(line.purchaseItemId), document = item && byDocument.get(item.purchaseId);
      if (!item || !document || line.purchaseReceipt.purchaseId !== item.purchaseId || line.purchaseReceipt.branchId !== document.destinationBranchId
        || line.currency !== item.currency || item.currency !== document.currency || line.quantity <= 0) throw inconsistent();
      const value = received.get(item.id) ?? { quantity: 0, cost: BigInt(0) };
      value.quantity += line.quantity;
      if (costVisible && "totalAcquisitionCostMinor" in line) value.cost += line.totalAcquisitionCostMinor;
      received.set(item.id, value);
    }
    const lines = items.map(item => {
      const document = byDocument.get(item.purchaseId)!;
      const value = received.get(item.id) ?? { quantity: 0, cost: BigInt(0) };
      if (item.currency !== document.currency || value.quantity > item.orderedQuantity || item.orderedQuantity <= 0) throw inconsistent();
      return { purchaseId: item.purchaseId, product: item.productNameSnapshot, variant: item.variantNameSnapshot, sku: item.skuSnapshot,
        currency: item.currency, ordered: item.orderedQuantity, received: value.quantity, remaining: item.orderedQuantity - value.quantity,
        unitCostMinor: costVisible && "unitCostMinor" in item ? item.unitCostMinor : null,
        lineTotalMinor: costVisible && "lineTotalMinor" in item ? item.lineTotalMinor : null,
        receivedCostMinor: costVisible ? value.cost : null };
    });
    return { costVisible, filters, generatedAt: new Date(),
      documents: documents.map(row => ({ id: row.id, number: row.purchaseNumber, status: row.status, currency: row.currency,
        createdAt: row.createdAt, supplier: row.supplier.name, branch: row.destinationBranch.name,
        totalMinor: costVisible && "totalMinor" in row ? row.totalMinor : null })), lines };
  }, { isolationLevel: "RepeatableRead", maxWait: 10000, timeout: 30000 });
}
export type PurchaseReport = Awaited<ReturnType<typeof getPurchaseReport>>;
