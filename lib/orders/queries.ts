import "server-only";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { getVariantAvailability } from "@/lib/availability/capacity";

export async function getOrders(t: TenantContext, i: { search?: string; status?: string; branchId?: string; source?: string; from?: Date; until?: Date }) {
  const q = i.search?.trim().slice(0, 100);
  return db.order.findMany({
    where: {
      organizationId: t.organizationId,
      status: i.status as never || undefined,
      branchId: i.branchId || undefined,
      channel: i.source as never || undefined,
      rentalStartAt: i.until ? { lt: i.until } : undefined,
      rentalEndAt: i.from ? { gt: i.from } : undefined,
      ...(q ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" as const } }, { customer: { OR: [{ firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } }, { contacts: { some: { value: { contains: q, mode: "insensitive" as const } } } }] } }] } : {})
    },
    include: { customer: { include: { contacts: { where: { type: "PHONE" }, orderBy: { isPrimary: "desc" }, take: 1 } } }, branch: true, _count: { select: { items: { where: { removedAt: null } } } } },
    orderBy: { createdAt: "desc" }, take: 200
  });
}

export async function getOrder(t: TenantContext, id: string) {
  return db.order.findFirst({
    where: { id, organizationId: t.organizationId },
    include: {
      customer: { include: { contacts: { orderBy: { isPrimary: "desc" } } } }, branch: true,
      items: { where: { removedAt: null }, include: { productVariant: { select: { product: { select: { trackingMode: true } } } }, capacityAllocations: { where: { status: "ACTIVE" } } }, orderBy: { createdAt: "asc" } },
      capacityAllocations: { where: { status: "ACTIVE" } },
      events: { include: { createdBy: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } }
    }
  });
}

export async function getOrderFormOptions(t: TenantContext, search?: string) {
  const q = search?.trim().slice(0, 80);
  const [customers, branches, variants] = await Promise.all([
    db.customer.findMany({ where: { organizationId: t.organizationId, status: "ACTIVE", ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { customerNumber: { contains: q, mode: "insensitive" } }] } : {}) }, include: { contacts: { where: { type: "PHONE" }, take: 1 } }, take: 50, orderBy: { firstName: "asc" } }),
    db.branch.findMany({ where: { organizationId: t.organizationId, status: "ACTIVE" }, orderBy: { sortOrder: "asc" } }),
    db.productVariant.findMany({ where: { organizationId: t.organizationId, isActive: true, product: { archivedAt: null, isRentable: true }, ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }] } : {}) }, include: { product: true, size: true }, take: 50, orderBy: { product: { name: "asc" } } })
  ]);
  return { customers, branches, variants };
}

export async function getAvailabilityForForm(t: TenantContext, input: { branchId: string; variantId: string; from: Date; until: Date; quantity: number }) {
  return getVariantAvailability({ tenant: t, branchId: input.branchId, productVariantId: input.variantId, requestedFrom: input.from, requestedUntil: input.until, requestedQuantity: input.quantity });
}

export async function getCustomerOrders(t: TenantContext, customerId: string) {
  return db.order.findMany({ where: { organizationId: t.organizationId, customerId }, select: { id: true, orderNumber: true, status: true, rentalStartAt: true, rentalEndAt: true, totalMinor: true, currency: true }, orderBy: { createdAt: "desc" }, take: 200 });
}
