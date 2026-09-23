import "server-only";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { getVariantAvailability } from "@/lib/availability/capacity";

type BranchScope={allowedBranchIds:string[]|null};const branchWhere=(scope?:BranchScope)=>scope?.allowedBranchIds?{in:scope.allowedBranchIds}:undefined;async function currentScope(t:TenantContext,scope?:BranchScope){if(scope)return scope;try{const{getCurrentSession}=await import("@/lib/auth/session"),s=await getCurrentSession();if(s?.organizationId===t.organizationId)return{allowedBranchIds:s.hasOrganizationWideBranchAccess?null:s.allowedBranchIds}}catch{}return undefined}
export async function getOrders(t: TenantContext, i: { search?: string; status?: string; type?: string; branchId?: string; source?: string; from?: Date; until?: Date },scope?:BranchScope) {
  scope=await currentScope(t,scope);
  const q = i.search?.trim().slice(0, 100);
  return db.order.findMany({
    where: {
      organizationId: t.organizationId,
      status: i.status as never || undefined,
      type: i.type as never || undefined,
      branchId: i.branchId || branchWhere(scope),
      channel: i.source as never || undefined,
      rentalStartAt: i.until ? { lt: i.until } : undefined,
      rentalEndAt: i.from ? { gt: i.from } : undefined,
      ...(q ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" as const } }, { customer: { OR: [{ firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } }, { contacts: { some: { value: { contains: q, mode: "insensitive" as const } } } }] } }] } : {})
    },
    include: { customer: { include: { contacts: { where: { type: "PHONE" }, orderBy: { isPrimary: "desc" }, take: 1 } } }, branch: true, _count: { select: { items: { where: { removedAt: null } } } } },
    orderBy: { createdAt: "desc" }, take: 200
  });
}

export async function getOrder(t: TenantContext, id: string,scope?:BranchScope) {
  scope=await currentScope(t,scope);
  return db.order.findFirst({
    where: { id, organizationId: t.organizationId,branchId:branchWhere(scope) },
    include: {
      customer: { include: { contacts: { orderBy: { isPrimary: "desc" } } } }, branch: true,
      items: { where: { removedAt: null }, include: { productVariant: { select: { product: { select: { trackingMode: true } } } }, capacityAllocations: { where: { sourceType: "ORDER", OR: [{ status: "ACTIVE" }, { issuedAt: { not: null } }] }, include: { productInstance: { include: { conditionHistory: { orderBy: { inspectedAt: "desc" }, take: 1 } } }, bulkPhysicalResolutions: { include: { lines: { select: { outcome: true, quantity: true } } }, orderBy: { occurredAt: "asc" } } }, orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } },
      capacityAllocations: { where: { sourceType: "ORDER", OR: [{ status: "ACTIVE" }, { issuedAt: { not: null } }] }, include: { productInstance: true } },
      events: { include: { createdBy: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } }
    }
  });
}

export async function getOrderFormOptions(t: TenantContext, search?: string,scope?:BranchScope) {
  scope=await currentScope(t,scope);
  const q = search?.trim().slice(0, 80);
  const [customers, branches, variants, locations] = await Promise.all([
    db.customer.findMany({ where: { organizationId: t.organizationId, status: "ACTIVE", ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { customerNumber: { contains: q, mode: "insensitive" } }, { contacts: { some: { value: { contains: q, mode: "insensitive" } } } }] } : {}) }, select: { id:true,customerNumber:true,firstName:true,lastName:true,contacts:{where:{type:"PHONE"},select:{value:true},take:1} }, take: 100, orderBy: { firstName: "asc" } }),
    db.branch.findMany({ where: { organizationId: t.organizationId, status: "ACTIVE",id:branchWhere(scope) }, orderBy: { sortOrder: "asc" } }),
    db.productVariant.findMany({ where: { organizationId: t.organizationId, isActive: true, product: { archivedAt: null, isRentable: true }, ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }, { product: { internalCode: { contains: q, mode: "insensitive" } } }, { execution: { name: { contains: q, mode: "insensitive" } } }, { size: { code: { contains: q, mode: "insensitive" } } }, { size: { name: { contains: q, mode: "insensitive" } } }, { instances: { some: { barcode: { contains: q, mode: "insensitive" } } } }] } : {}) }, select: {id:true,sku:true,product:{select:{name:true,internalCode:true}},execution:{select:{name:true}},size:{select:{name:true,code:true,sizeSystem:true}},prices:{where:{type:"RENTAL",validFrom:{lte:new Date()}},orderBy:{validFrom:"desc"},take:1,select:{amountMinor:true,currency:true}}}, take: 100, orderBy: { product: { name: "asc" } } }),
    db.location.findMany({ where: { organizationId: t.organizationId, isActive: true, branchId: branchWhere(scope) }, select: { id: true, branchId: true, name: true, type: true }, orderBy: [{ branchId: "asc" }, { name: "asc" }] })
  ]);
  return { customers, branches, variants:variants.map(v=>({...v,priceMinor:v.prices[0]?.amountMinor.toString()??null,currency:v.prices[0]?.currency??"KZT",prices:undefined})), locations };
}

export async function getAvailabilityForForm(t: TenantContext, input: { branchId: string; variantId: string; from: Date; until: Date; quantity: number }) {
  const scope=await currentScope(t);if(scope?.allowedBranchIds&&!scope.allowedBranchIds.includes(input.branchId))throw new Error("Филиал недоступен.");
  return getVariantAvailability({ tenant: t, branchId: input.branchId, productVariantId: input.variantId, requestedFrom: input.from, requestedUntil: input.until, requestedQuantity: input.quantity });
}

export async function getCustomerOrders(t: TenantContext, customerId: string) {
  return db.order.findMany({ where: { organizationId: t.organizationId, customerId }, select: { id: true, orderNumber: true, status: true, rentalStartAt: true, rentalEndAt: true, totalMinor: true, currency: true }, orderBy: { createdAt: "desc" }, take: 200 });
}
