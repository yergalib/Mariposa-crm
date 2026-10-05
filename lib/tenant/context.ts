import "server-only";

declare const tenantContextBrand: unique symbol;

export type TenantContext = Readonly<{
  organizationId: string;
  [tenantContextBrand]: true;
}>;

export function createTenantContext(organizationId: string): TenantContext {
  if (!organizationId) {
    throw new Error("A trusted organizationId is required for tenant-scoped data access.");
  }

  return Object.freeze({ organizationId }) as TenantContext;
}
