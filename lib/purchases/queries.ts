import "server-only";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import type { AuthContext } from "@/lib/auth/session";
import { hasPermission, requirePermission } from "@/lib/permissions/effective";
import {
  accessibleBranchIds,
  requireBranchAccess,
} from "@/lib/staff/branch-access";
import { PurchaseError } from "@/lib/purchases/errors";
type Actor = Pick<AuthContext, "membershipId" | "role">;
const pc = (t: TenantContext, a: Actor) => ({
  organizationId: t.organizationId,
  membershipId: a.membershipId,
  role: a.role,
});

export async function listSuppliers(
  t: TenantContext,
  a: Actor,
  includeArchived = true,
) {
  await requirePermission(pc(t, a), "SUPPLIER_VIEW");
  return db.supplier.findMany({
    where: {
      organizationId: t.organizationId,
      status: includeArchived ? undefined : "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      contactName: true,
      phone: true,
      email: true,
      address: true,
      notes: true,
      status: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { purchases: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 200,
  });
}
export async function getSupplier(t: TenantContext, id: string, a: Actor) {
  await requirePermission(pc(t, a), "SUPPLIER_VIEW");
  return db.supplier.findFirst({
    where: { id, organizationId: t.organizationId },
    select: {
      id: true,
      name: true,
      contactName: true,
      phone: true,
      email: true,
      address: true,
      notes: true,
      status: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { purchases: true } },
    },
  });
}

export async function listPurchases(t: TenantContext, a: Actor) {
  await requirePermission(pc(t, a), "PURCHASE_VIEW");
  const ids = await accessibleBranchIds(t, a.membershipId),
    cost = await hasPermission(pc(t, a), "FINANCE_PURCHASE_COST_VIEW");
  const rows = await db.purchase.findMany({
    where: {
      organizationId: t.organizationId,
      destinationBranchId: ids ? { in: ids } : undefined,
    },
    select: {
      id: true,
      purchaseNumber: true,
      status: true,
      currency: true,
      createdAt: true,
      supplier: { select: { name: true } },
      destinationBranch: { select: { name: true } },
      _count: { select: { items: true } },
      ...(cost
        ? {
            totalMinor: true,
            subtotalMinor: true,
            lineDiscountTotalMinor: true,
            additionalCostMinor: true,
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return {
    rows: rows.map((row) => ({
      ...row,
      costVisible: cost,
      totalMinor: cost && "totalMinor" in row ? row.totalMinor : null,
      subtotalMinor: cost && "subtotalMinor" in row ? row.subtotalMinor : null,
      lineDiscountTotalMinor:
        cost && "lineDiscountTotalMinor" in row
          ? row.lineDiscountTotalMinor
          : null,
      additionalCostMinor:
        cost && "additionalCostMinor" in row ? row.additionalCostMinor : null,
    })),
    costVisible: cost,
  };
}
export async function getPurchase(t: TenantContext, id: string, a: Actor) {
  await requirePermission(pc(t, a), "PURCHASE_VIEW");
  const base = await db.purchase.findFirst({
    where: { id, organizationId: t.organizationId },
    select: {
      id: true,
      purchaseNumber: true,
      supplierId: true,
      destinationBranchId: true,
      status: true,
      currency: true,
      externalReference: true,
      note: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      confirmedAt: true,
      cancelledAt: true,
      closedAt: true,
      closeReason: true,
      supplier: { select: { name: true, status: true } },
      destinationBranch: { select: { name: true } },
      items: {
        select: {
          id: true,
          productVariantId: true,
          orderedQuantity: true,
          currency: true,
          productNameSnapshot: true,
          variantNameSnapshot: true,
          skuSnapshot: true,
          supplierModelSnapshot: true,
          note: true,
          sortOrder: true,
          receiptLines: {
            select: {
              id: true,
              quantity: true,
              purchaseReceipt: {
                select: {
                  id: true,
                  receiptNumber: true,
                  receivedAt: true,
                  location: { select: { name: true } },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!base) throw new PurchaseError("NOT_FOUND", "Закупка не найдена.");
  await requireBranchAccess(t, a.membershipId, base.destinationBranchId);
  const cost = await hasPermission(pc(t, a), "FINANCE_PURCHASE_COST_VIEW");
  if (!cost)
    return {
      ...base,
      costVisible: false,
      subtotalMinor: null,
      lineDiscountTotalMinor: null,
      additionalCostMinor: null,
      totalMinor: null,
      items: base.items.map((i) => ({
        ...i,
        unitCostMinor: null,
        lineDiscountMinor: null,
        allocatedAdditionalCostMinor: null,
        lineTotalMinor: null,
      })),
    };
  const values = await db.purchase.findUniqueOrThrow({
      where: { id },
      select: {
        subtotalMinor: true,
        lineDiscountTotalMinor: true,
        additionalCostMinor: true,
        totalMinor: true,
        items: {
          select: {
            id: true,
            unitCostMinor: true,
            lineDiscountMinor: true,
            allocatedAdditionalCostMinor: true,
            lineTotalMinor: true,
            receiptLines: {
              select: {
                id: true,
                unitAcquisitionCostMinor: true,
                totalAcquisitionCostMinor: true,
              },
            },
          },
        },
      },
    }),
    byId = new Map(values.items.map((i) => [i.id, i]));
  return {
    ...base,
    ...values,
    costVisible: true,
    items: base.items.map((i) => ({
      ...i,
      ...byId.get(i.id),
      receiptLines: i.receiptLines.map((line) => ({
        ...line,
        ...byId.get(i.id)?.receiptLines.find((value) => value.id === line.id),
      })),
    })),
  };
}
export async function getPurchaseOptions(t: TenantContext, a: Actor) {
  await requirePermission(pc(t, a), "PURCHASE_VIEW");
  const ids = await accessibleBranchIds(t, a.membershipId);
  const [branches, suppliers, variants, organization] = await Promise.all([
    db.branch.findMany({
      where: {
        organizationId: t.organizationId,
        status: "ACTIVE",
        id: ids ? { in: ids } : undefined,
      },
      select: {
        id: true,
        name: true,
        locations: {
          select: { id: true, name: true, type: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
    db.supplier.findMany({
      where: { organizationId: t.organizationId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.productVariant.findMany({
      where: {
        organizationId: t.organizationId,
        isActive: true,
        product: { archivedAt: null },
      },
      select: {
        id: true,
        sku: true,
        product: { select: { name: true } },
        size: { select: { name: true, code: true } },
      },
      orderBy: { sku: "asc" },
      take: 500,
    }),
    db.organization.findUniqueOrThrow({
      where: { id: t.organizationId },
      select: { defaultCurrency: true },
    }),
  ]);
  return {
    branches,
    suppliers,
    variants,
    defaultCurrency: organization.defaultCurrency,
  };
}
