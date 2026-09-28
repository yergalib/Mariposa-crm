import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { normalizeScannableCode } from "@/lib/catalog/scannable-code";
import { db } from "@/lib/db";
import type { BulkOperationalActor } from "@/lib/fulfillment/bulk-authorization";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import { defaultHasPermission, type PermissionKey } from "@/lib/permissions/registry";
import type { TenantContext } from "@/lib/tenant/context";

export const SCAN_PURPOSES = ["CATALOG_LOOKUP", "ORDER_ITEM_SELECT", "FULFILLMENT_ISSUE", "RETURN_RECEIVE", "STOCKTAKE_COUNT", "WAREHOUSE_LOOKUP"] as const;
export type ScanPurpose = typeof SCAN_PURPOSES[number];
export const SCAN_PURPOSE_PERMISSIONS: Readonly<Record<ScanPurpose, readonly PermissionKey[]>> = {
  CATALOG_LOOKUP: ["CATALOG_VIEW"], ORDER_ITEM_SELECT: ["ORDER_CREATE", "ORDER_EDIT"], FULFILLMENT_ISSUE: ["RENTAL_ISSUE", "SALE_FULFILL"], RETURN_RECEIVE: ["RETURN_PROCESS"], STOCKTAKE_COUNT: ["STOCKTAKE_COUNT"], WAREHOUSE_LOOKUP: ["INVENTORY_VIEW"]
};

type SafeProduct = { id: string; name: string; code: string };
type SafeExecution = { id: string; name: string } | null;
export type SafeSize = { code: string; name: string; sizeSystem: string; recommendedHeightCm: number | null; lengthCm: number | null };
export type OperationalIdentifierResult =
  | { kind: "BULK_VARIANT"; normalizedIdentifier: string; product: SafeProduct; execution: SafeExecution; variant: { id: string; sku: string; size: SafeSize } }
  | { kind: "SERIALIZED_INSTANCE"; normalizedIdentifier: string; product: SafeProduct; execution: SafeExecution; variant: { id: string; sku: string; size: SafeSize }; instance: { id: string; barcode: string; inventoryNumber: string; operationalStatus: string; conditionStatus: string; branchId: string; locationId: string } }
  | { kind: "PRODUCT_NEEDS_VARIANT_SELECTION"; normalizedIdentifier: string; product: SafeProduct; trackingMode: "BULK" | "SERIALIZED"; variants: Array<{ id: string; sku: string; execution: SafeExecution; size: SafeSize }> }
  | { kind: "NOT_FOUND"; normalizedIdentifier: string; reason?: "BRANCH_MISMATCH" }
  | { kind: "NOT_AVAILABLE"; normalizedIdentifier: string }
  | { kind: "AMBIGUOUS_IDENTIFIER"; normalizedIdentifier: string };
export type ResolveIdentifierInput = { rawIdentifier: string; purpose: ScanPurpose; branchId?: string };

export function classifyOperationalIdentifier(input: { variantCount: number; instanceCount: number; productCount: number }) {
  const kinds = Number(input.variantCount > 0) + Number(input.instanceCount > 0) + Number(input.productCount > 0);
  if (input.variantCount > 1 || input.instanceCount > 1 || input.productCount > 1 || kinds > 1) return "AMBIGUOUS_IDENTIFIER" as const;
  if (input.variantCount === 1) return "BULK_VARIANT" as const;
  if (input.instanceCount === 1) return "SERIALIZED_INSTANCE" as const;
  if (input.productCount === 1) return "PRODUCT_NEEDS_VARIANT_SELECTION" as const;
  return "NOT_FOUND" as const;
}

async function authorize(tx: Prisma.TransactionClient, tenant: TenantContext, actor: BulkOperationalActor, purpose: ScanPurpose, branchId?: string) {
  const permissions = SCAN_PURPOSE_PERMISSIONS[purpose];
  const membership = await tx.organizationMembership.findFirst({ where: { id: actor.membershipId, organizationId: tenant.organizationId, userId: actor.userId, status: "ACTIVE", user: { status: "ACTIVE" }, organization: { status: "ACTIVE" } }, select: { role: true, permissionOverrides: { where: { permissionKey: { in: [...permissions] } }, select: { permissionKey: true, effect: true } }, branchAccess: branchId ? { where: { branchId, branch: { status: "ACTIVE" } }, select: { branchId: true }, take: 1 } : { where: { branch: { status: "ACTIVE" } }, select: { branchId: true } } } });
  if (!membership) throw new FulfillmentError("NOT_FOUND", "Операция недоступна.");
  const overrides = new Map(membership.permissionOverrides.map(row => [row.permissionKey, row.effect]));
  const permitted = membership.role === "OWNER" || permissions.some(permission => overrides.has(permission) ? overrides.get(permission) === "ALLOW" : defaultHasPermission(membership.role, permission));
  if (!permitted) throw new FulfillmentError("FORBIDDEN", "Недостаточно прав для операции.");
  if (branchId) {
    const branch = await tx.branch.findFirst({ where: { id: branchId, organizationId: tenant.organizationId, status: "ACTIVE" }, select: { id: true } });
    if (!branch || membership.role !== "OWNER" && membership.branchAccess.length === 0) throw new FulfillmentError("NOT_FOUND", "Филиал недоступен.");
  }
}

const sizeSelect = { code: true, name: true, sizeSystem: true, recommendedHeightCm: true, lengthCm: true } as const;
export async function resolveOperationalIdentifier(tenant: TenantContext, input: ResolveIdentifierInput, actor: BulkOperationalActor): Promise<OperationalIdentifierResult> {
  const normalizedIdentifier = normalizeScannableCode(input.rawIdentifier);
  if (!normalizedIdentifier) return { kind: "NOT_FOUND", normalizedIdentifier };
  return db.$transaction(async tx => {
    await authorize(tx, tenant, actor, input.purpose, input.branchId);
    const variants = await tx.productVariant.findMany({ where: { organizationId: tenant.organizationId, sku: { equals: normalizedIdentifier, mode: "insensitive" }, isActive: true, product: { trackingMode: "BULK", archivedAt: null, publicationStatus: "ACTIVE" } }, select: { id: true, sku: true, product: { select: { id: true, name: true, internalCode: true } }, execution: { select: { id: true, name: true } }, size: { select: sizeSelect } }, take: 2 });
    const instances = await tx.productInstance.findMany({ where: { organizationId: tenant.organizationId, barcode: { equals: normalizedIdentifier, mode: "insensitive" }, productVariant: { isActive: true, product: { trackingMode: "SERIALIZED", archivedAt: null, publicationStatus: "ACTIVE" } } }, select: { id: true, barcode: true, inventoryNumber: true, operationalStatus: true, conditionStatus: true, currentBranchId: true, currentLocationId: true, productVariant: { select: { id: true, sku: true, product: { select: { id: true, name: true, internalCode: true } }, execution: { select: { id: true, name: true } }, size: { select: sizeSelect } } } }, take: 2 });
    const products = await tx.product.findMany({ where: { organizationId: tenant.organizationId, internalCode: { equals: normalizedIdentifier, mode: "insensitive" }, archivedAt: null, publicationStatus: "ACTIVE" }, select: { id: true, name: true, internalCode: true, trackingMode: true, variants: { where: { organizationId: tenant.organizationId, isActive: true }, select: { id: true, sku: true, execution: { select: { id: true, name: true } }, size: { select: sizeSelect } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } }, take: 2 });
    const classification = classifyOperationalIdentifier({ variantCount: variants.length, instanceCount: instances.length, productCount: products.length });
    if (classification === "AMBIGUOUS_IDENTIFIER") return { kind: classification, normalizedIdentifier };
    if (classification === "BULK_VARIANT") { const row=variants[0]; return { kind: classification, normalizedIdentifier, product: { id: row.product.id, name: row.product.name, code: row.product.internalCode }, execution: row.execution, variant: { id: row.id, sku: row.sku, size: row.size } }; }
    if (classification === "SERIALIZED_INSTANCE") { const row=instances[0]; if (input.branchId && row.currentBranchId !== input.branchId) return { kind: "NOT_FOUND", normalizedIdentifier, reason: "BRANCH_MISMATCH" }; await authorize(tx, tenant, actor, input.purpose, row.currentBranchId); return { kind: classification, normalizedIdentifier, product: { id: row.productVariant.product.id, name: row.productVariant.product.name, code: row.productVariant.product.internalCode }, execution: row.productVariant.execution, variant: { id: row.productVariant.id, sku: row.productVariant.sku, size: row.productVariant.size }, instance: { id: row.id, barcode: row.barcode, inventoryNumber: row.inventoryNumber, operationalStatus: row.operationalStatus, conditionStatus: row.conditionStatus, branchId: row.currentBranchId, locationId: row.currentLocationId } }; }
    if (classification === "PRODUCT_NEEDS_VARIANT_SELECTION") { const row=products[0]; return { kind: classification, normalizedIdentifier, product: { id: row.id, name: row.name, code: row.internalCode }, trackingMode: row.trackingMode, variants: row.variants }; }
    const unavailable = await tx.productVariant.count({ where: { organizationId: tenant.organizationId, sku: { equals: normalizedIdentifier, mode: "insensitive" } } }) + await tx.productInstance.count({ where: { organizationId: tenant.organizationId, barcode: { equals: normalizedIdentifier, mode: "insensitive" } } }) + await tx.product.count({ where: { organizationId: tenant.organizationId, internalCode: { equals: normalizedIdentifier, mode: "insensitive" } } });
    return unavailable ? { kind: "NOT_AVAILABLE", normalizedIdentifier } : { kind: "NOT_FOUND", normalizedIdentifier };
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 20_000 });
}
