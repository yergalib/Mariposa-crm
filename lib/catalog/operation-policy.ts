import type { Prisma } from "@/generated/prisma/client";

export type CatalogOperation = "RENTAL" | "SALE";
type Overrides = { isRentableOverride?: boolean | null; isSellableOverride?: boolean | null; showOnWebsiteOverride?: boolean | null };
type PolicyProduct = {
  id: string; organizationId: string; isRentable: boolean; isSellable: boolean; showOnWebsite: boolean;
  directIsRentableOverride?: boolean | null; directIsSellableOverride?: boolean | null; directShowOnWebsiteOverride?: boolean | null;
};
type PolicyExecution = Overrides & { id: string; productId: string; organizationId: string; isActive: boolean };

/** Model flags are hard gates. Null overrides inherit; an unresolved execution fails closed. */
export function resolveOperationPolicy(product: PolicyProduct, executionId: string | null, execution: PolicyExecution | null) {
  const valid = executionId === null || Boolean(execution && execution.id === executionId && execution.productId === product.id
    && execution.organizationId === product.organizationId && execution.isActive);
  const group: Overrides = executionId === null ? {
    isRentableOverride: product.directIsRentableOverride,
    isSellableOverride: product.directIsSellableOverride,
    showOnWebsiteOverride: product.directShowOnWebsiteOverride,
  } : execution ?? {};
  return {
    isRentable: valid && product.isRentable && (group.isRentableOverride ?? true),
    isSellable: valid && product.isSellable && (group.isSellableOverride ?? true),
    showOnWebsite: valid && product.showOnWebsite && (group.showOnWebsiteOverride ?? true),
  };
}

function inheritedFlag(organizationId: string, flag: keyof Overrides, directFlag: keyof PolicyProduct): Prisma.ProductVariantWhereInput {
  // The existing execution-integrity trigger enforces variant/execution tenant and product identity.
  return { OR: [
    { executionId: null, product: { OR: [{ [directFlag]: null }, { [directFlag]: true }] } },
    { executionId: { not: null }, execution: { organizationId, isActive: true, OR: [{ [flag]: null }, { [flag]: true }] } },
  ] };
}

/** Shared SQL filter: apply before pagination and inside transactions creating new commitments.
 * Caller retains branch/membership checks. Historical reads, returns and settlements do not use this filter.
 */
export function variantOperationWhere(organizationId: string, operation: CatalogOperation, published = false): Prisma.ProductVariantWhereInput {
  const rental = operation === "RENTAL";
  return {
    organizationId, isActive: true,
    product: { organizationId, archivedAt: null, publicationStatus: "ACTIVE", ...(rental ? { isRentable: true } : { isSellable: true }), ...(published ? { showOnWebsite: true } : {}) },
    size: { organizationId, isActive: true },
    AND: [inheritedFlag(organizationId, rental ? "isRentableOverride" : "isSellableOverride", rental ? "directIsRentableOverride" : "directIsSellableOverride"),
      ...(published ? [inheritedFlag(organizationId, "showOnWebsiteOverride", "directShowOnWebsiteOverride")] : [])],
  };
}
