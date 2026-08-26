import "server-only";

import type { AllocationSourceType, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  AllocationNotFoundError,
  InsufficientCapacityError,
  InstanceUnavailableError,
  InvalidAllocationStateError,
  InvalidQuantityError,
  ResourceNotFoundError,
  isDatabaseExclusionViolation
} from "@/lib/availability/errors";
import { calculateEffectiveInterval } from "@/lib/availability/interval";
import type { TenantContext } from "@/lib/tenant/context";

const PERMANENTLY_UNAVAILABLE = ["SOLD", "WRITTEN_OFF", "LOST"] as const;
const TEMPORARILY_UNAVAILABLE = ["PICKING", "READY_FOR_PICKUP", "RENTED", "RETURN_INSPECTION", "CLEANING", "REPAIR", "IN_TRANSFER"] as const;
const OPEN_ENDED_SOURCES: AllocationSourceType[] = ["MAINTENANCE", "MANUAL_BLOCK"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DatabaseClient = typeof db | Prisma.TransactionClient;

export type VariantAvailability = {
  trackingMode: "SERIALIZED" | "BULK";
  totalCapacity: number;
  reservedCapacity: number;
  untrackedUnavailableCapacity: number;
  availableCapacity: number;
  requestedQuantity: number;
  canFulfill: boolean;
  effectiveBlockedFrom: Date;
  effectiveBlockedUntil: Date | null;
  turnaroundBufferMinutes: number;
};

type AvailabilityInput = {
  tenant: TenantContext;
  branchId: string;
  productVariantId: string;
  requestedFrom: Date;
  requestedUntil: Date;
  requestedQuantity?: number;
};

export type AvailableInstance = {
  id: string;
  inventoryNumber: string;
  barcode: string;
  operationalStatus: string;
  conditionStatus: string;
};

export type ReserveCapacityInput = {
  tenant: TenantContext;
  branchId: string;
  productVariantId: string;
  productInstanceId?: string;
  orderId?: string;
  orderItemId?: string;
  sourceType: AllocationSourceType;
  sourceReferenceId?: string;
  quantity: number;
  requestedFrom: Date;
  requestedUntil: Date | null;
  assignedByUserId?: string;
};

function assertPositiveQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new InvalidQuantityError();
}

function assertResourceIds(...ids: string[]) {
  if (ids.some((id) => !UUID_PATTERN.test(id))) throw new ResourceNotFoundError();
}

function overlappingWhere(from: Date, until: Date | null) {
  return {
    blockedFrom: until ? { lt: until } : undefined,
    OR: [{ blockedUntil: null }, { blockedUntil: { gt: from } }]
  };
}

async function getVariantContext(client: DatabaseClient, organizationId: string, branchId: string, productVariantId: string) {
  const [variant, branch, settings] = await Promise.all([
    client.productVariant.findFirst({
      where: { id: productVariantId, organizationId, isActive: true, product: { organizationId, archivedAt: null } },
      select: { product: { select: { trackingMode: true, turnaroundBufferMinutes: true } } }
    }),
    client.branch.findFirst({ where: { id: branchId, organizationId, status: "ACTIVE" }, select: { id: true } }),
    client.organizationSettings.findUnique({ where: { organizationId }, select: { turnaroundBufferMinutes: true } })
  ]);
  if (!variant || !branch) throw new ResourceNotFoundError();
  const turnaroundBufferMinutes = variant.product.turnaroundBufferMinutes ?? settings?.turnaroundBufferMinutes ?? 0;
  if (!Number.isInteger(turnaroundBufferMinutes) || turnaroundBufferMinutes < 0) throw new ResourceNotFoundError();
  return { trackingMode: variant.product.trackingMode, turnaroundBufferMinutes };
}

async function getVariantAvailabilityWithClient(client: DatabaseClient, input: AvailabilityInput): Promise<VariantAvailability> {
  const requestedQuantity = input.requestedQuantity ?? 1;
  assertPositiveQuantity(requestedQuantity);
  const organizationId = input.tenant.organizationId;
  const context = await getVariantContext(client, organizationId, input.branchId, input.productVariantId);
  const interval = calculateEffectiveInterval({
    requestedFrom: input.requestedFrom,
    requestedUntil: input.requestedUntil,
    turnaroundBufferMinutes: context.turnaroundBufferMinutes,
    allowOpenEnded: false
  });

  const totalCapacity = context.trackingMode === "SERIALIZED"
    ? await client.productInstance.count({
        where: { organizationId, productVariantId: input.productVariantId, currentBranchId: input.branchId, retiredAt: null, operationalStatus: { notIn: [...PERMANENTLY_UNAVAILABLE] } }
      })
    : (await client.stockLevel.aggregate({
        where: { organizationId, productVariantId: input.productVariantId, branchId: input.branchId },
        _sum: { quantity: true }
      }))._sum.quantity ?? 0;

  const reservedResult = await client.capacityAllocation.aggregate({
    where: { organizationId, branchId: input.branchId, productVariantId: input.productVariantId, status: "ACTIVE", ...overlappingWhere(interval.effectiveBlockedFrom, interval.effectiveBlockedUntil) },
    _sum: { quantity: true }
  });
  const reservedCapacity = reservedResult._sum?.quantity ?? 0;

  const now = new Date();
  const untrackedUnavailableCapacity = context.trackingMode === "SERIALIZED"
    ? await client.productInstance.count({
        where: {
          organizationId,
          productVariantId: input.productVariantId,
          currentBranchId: input.branchId,
          retiredAt: null,
          operationalStatus: { in: [...TEMPORARILY_UNAVAILABLE] },
          capacityAllocations: { none: { organizationId, status: "ACTIVE", blockedFrom: { lte: now }, OR: [{ blockedUntil: null }, { blockedUntil: { gt: now } }] } }
        }
      })
    : 0;
  const availableCapacity = Math.max(0, totalCapacity - reservedCapacity - untrackedUnavailableCapacity);

  return { trackingMode: context.trackingMode, totalCapacity, reservedCapacity, untrackedUnavailableCapacity, availableCapacity, requestedQuantity, canFulfill: requestedQuantity <= availableCapacity, ...interval };
}

export function getVariantAvailability(input: AvailabilityInput) {
  assertResourceIds(input.tenant.organizationId, input.branchId, input.productVariantId);
  return getVariantAvailabilityWithClient(db, input);
}

export async function findAvailableInstances(input: AvailabilityInput): Promise<AvailableInstance[]> {
  assertResourceIds(input.tenant.organizationId, input.branchId, input.productVariantId);
  const availability = await getVariantAvailabilityWithClient(db, input);
  if (availability.trackingMode !== "SERIALIZED") return [];
  const organizationId = input.tenant.organizationId;
  const now = new Date();
  return db.productInstance.findMany({
    where: {
      organizationId,
      productVariantId: input.productVariantId,
      currentBranchId: input.branchId,
      retiredAt: null,
      operationalStatus: { notIn: [...PERMANENTLY_UNAVAILABLE] },
      capacityAllocations: { none: { organizationId, status: "ACTIVE", ...overlappingWhere(availability.effectiveBlockedFrom, availability.effectiveBlockedUntil) } },
      OR: [
        { operationalStatus: "AVAILABLE" },
        { capacityAllocations: { some: { organizationId, status: "ACTIVE", blockedFrom: { lte: now }, OR: [{ blockedUntil: null }, { blockedUntil: { gt: now } }] } } }
      ]
    },
    select: { id: true, inventoryNumber: true, barcode: true, operationalStatus: true, conditionStatus: true },
    orderBy: { inventoryNumber: "asc" }
  });
}

export async function reserveCapacity(input: ReserveCapacityInput) {
  assertResourceIds(input.tenant.organizationId, input.branchId, input.productVariantId);
  if (input.productInstanceId) assertResourceIds(input.productInstanceId);
  if (input.orderId) assertResourceIds(input.orderId);
  if (input.orderItemId) assertResourceIds(input.orderItemId);
  if (input.assignedByUserId) assertResourceIds(input.assignedByUserId);
  assertPositiveQuantity(input.quantity);
  if (input.productInstanceId && input.quantity !== 1) throw new InvalidQuantityError();
  if (input.sourceType === "ORDER" && !input.orderItemId) throw new ResourceNotFoundError();
  const allowOpenEnded = OPEN_ENDED_SOURCES.includes(input.sourceType);
  if (!input.requestedUntil && !allowOpenEnded) {
    calculateEffectiveInterval({ requestedFrom: input.requestedFrom, requestedUntil: null, turnaroundBufferMinutes: 0, allowOpenEnded: false });
  }
  const organizationId = input.tenant.organizationId;

  try {
    return await db.$transaction(async (tx) => {
      const lockKey = `${organizationId}:${input.branchId}:${input.productVariantId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const context = await getVariantContext(tx, organizationId, input.branchId, input.productVariantId);
      const interval = calculateEffectiveInterval({ requestedFrom: input.requestedFrom, requestedUntil: input.requestedUntil, turnaroundBufferMinutes: context.turnaroundBufferMinutes, allowOpenEnded });
      if (input.productInstanceId && context.trackingMode !== "SERIALIZED") throw new InstanceUnavailableError();

      let resolvedOrderId = input.orderId;
      if (input.sourceType === "ORDER") {
        const orderItem = await tx.orderItem.findFirst({
          where: { id: input.orderItemId, organizationId, productVariantId: input.productVariantId, ...(input.orderId ? { orderId: input.orderId } : {}), order: { organizationId, branchId: input.branchId } },
          select: { orderId: true }
        });
        if (!orderItem) throw new ResourceNotFoundError();
        resolvedOrderId = orderItem.orderId;
      }
      if (input.assignedByUserId) {
        const membership = await tx.organizationMembership.findFirst({ where: { organizationId, userId: input.assignedByUserId, status: "ACTIVE" }, select: { id: true } });
        if (!membership) throw new ResourceNotFoundError();
      }

      const availability = input.requestedUntil
        ? await getVariantAvailabilityWithClient(tx, { tenant: input.tenant, branchId: input.branchId, productVariantId: input.productVariantId, requestedFrom: input.requestedFrom, requestedUntil: input.requestedUntil, requestedQuantity: input.quantity })
        : await getOpenEndedAvailability(tx, input, context.trackingMode);
      if (!availability.canFulfill) throw new InsufficientCapacityError(availability.availableCapacity, input.quantity);

      if (input.productInstanceId) {
        const instance = await tx.productInstance.findFirst({
          where: {
            id: input.productInstanceId,
            organizationId,
            productVariantId: input.productVariantId,
            currentBranchId: input.branchId,
            retiredAt: null,
            operationalStatus: { notIn: [...PERMANENTLY_UNAVAILABLE] },
            ...(input.sourceType === "ORDER" || input.sourceType === "TRANSFER"
              ? {
                  OR: [
                    { operationalStatus: "AVAILABLE" as const },
                    {
                      capacityAllocations: {
                        some: {
                          organizationId,
                          status: "ACTIVE" as const,
                          blockedFrom: { lte: new Date() },
                          OR: [{ blockedUntil: null }, { blockedUntil: { gt: new Date() } }]
                        }
                      }
                    }
                  ]
                }
              : {}),
            capacityAllocations: { none: { organizationId, status: "ACTIVE", ...overlappingWhere(interval.effectiveBlockedFrom, interval.effectiveBlockedUntil) } }
          },
          select: { id: true }
        });
        if (!instance) throw new InstanceUnavailableError();
      }

      return tx.capacityAllocation.create({
        data: { organizationId, branchId: input.branchId, productVariantId: input.productVariantId, productInstanceId: input.productInstanceId, orderId: resolvedOrderId, orderItemId: input.orderItemId, sourceType: input.sourceType, sourceReferenceId: input.sourceReferenceId, quantity: input.quantity, blockedFrom: interval.effectiveBlockedFrom, blockedUntil: interval.effectiveBlockedUntil, assignedByUserId: input.assignedByUserId, status: "ACTIVE" }
      });
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (isDatabaseExclusionViolation(error)) throw new InstanceUnavailableError();
    throw error;
  }
}

async function getOpenEndedAvailability(client: DatabaseClient, input: ReserveCapacityInput, trackingMode: "SERIALIZED" | "BULK") {
  const organizationId = input.tenant.organizationId;
  const totalCapacity = trackingMode === "SERIALIZED"
    ? await client.productInstance.count({ where: { organizationId, productVariantId: input.productVariantId, currentBranchId: input.branchId, retiredAt: null, operationalStatus: { notIn: [...PERMANENTLY_UNAVAILABLE] } } })
    : (await client.stockLevel.aggregate({ where: { organizationId, productVariantId: input.productVariantId, branchId: input.branchId }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const reservedResult = await client.capacityAllocation.aggregate({ where: { organizationId, branchId: input.branchId, productVariantId: input.productVariantId, status: "ACTIVE", ...overlappingWhere(input.requestedFrom, null) }, _sum: { quantity: true } });
  const reservedCapacity = reservedResult._sum?.quantity ?? 0;
  const availableCapacity = Math.max(0, totalCapacity - reservedCapacity);
  return { availableCapacity, canFulfill: input.quantity <= availableCapacity };
}

export async function assignInstanceToAllocation(input: { tenant: TenantContext; allocationId: string; productInstanceId: string; assignedByUserId?: string }) {
  assertResourceIds(input.tenant.organizationId, input.allocationId, input.productInstanceId);
  if (input.assignedByUserId) assertResourceIds(input.assignedByUserId);
  const organizationId = input.tenant.organizationId;
  try {
    return await db.$transaction(async (tx) => {
      const allocation = await tx.capacityAllocation.findFirst({
        where: { id: input.allocationId, organizationId },
        select: { id: true, status: true, sourceType: true, quantity: true, branchId: true, productVariantId: true, blockedFrom: true, blockedUntil: true, productVariant: { select: { product: { select: { trackingMode: true } } } } }
      });
      if (!allocation) throw new AllocationNotFoundError();
      if (allocation.status !== "ACTIVE") throw new InvalidAllocationStateError();
      if (allocation.quantity !== 1 || allocation.productVariant.product.trackingMode !== "SERIALIZED") throw new InstanceUnavailableError();
      const lockKey = `${organizationId}:${allocation.branchId}:${allocation.productVariantId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const instance = await tx.productInstance.findFirst({
        where: {
          id: input.productInstanceId,
          organizationId,
          productVariantId: allocation.productVariantId,
          currentBranchId: allocation.branchId,
          retiredAt: null,
          operationalStatus: { notIn: [...PERMANENTLY_UNAVAILABLE] },
          ...(allocation.sourceType === "ORDER" || allocation.sourceType === "TRANSFER"
            ? {
                OR: [
                  { operationalStatus: "AVAILABLE" as const },
                  { capacityAllocations: { some: { organizationId, status: "ACTIVE" as const, blockedFrom: { lte: new Date() }, OR: [{ blockedUntil: null }, { blockedUntil: { gt: new Date() } }] } } }
                ]
              }
            : {}),
          capacityAllocations: { none: { id: { not: allocation.id }, organizationId, status: "ACTIVE", ...overlappingWhere(allocation.blockedFrom, allocation.blockedUntil) } }
        },
        select: { id: true }
      });
      if (!instance) throw new InstanceUnavailableError();
      if (input.assignedByUserId) {
        const member = await tx.organizationMembership.findFirst({ where: { organizationId, userId: input.assignedByUserId, status: "ACTIVE" }, select: { id: true } });
        if (!member) throw new ResourceNotFoundError();
      }
      return tx.capacityAllocation.update({ where: { id: allocation.id }, data: { productInstanceId: instance.id, assignedAt: new Date(), assignedByUserId: input.assignedByUserId } });
    });
  } catch (error) {
    if (isDatabaseExclusionViolation(error)) throw new InstanceUnavailableError();
    throw error;
  }
}

export async function releaseCapacityAllocation(input: { tenant: TenantContext; allocationId: string; outcome: "RELEASED" | "CANCELLED"; reason: string }) {
  assertResourceIds(input.tenant.organizationId, input.allocationId);
  const organizationId = input.tenant.organizationId;
  const reason = input.reason.trim();
  if (!reason) throw new InvalidAllocationStateError();
  return db.$transaction(async (tx) => {
    const allocation = await tx.capacityAllocation.findFirst({ where: { id: input.allocationId, organizationId }, select: { id: true, status: true } });
    if (!allocation) throw new AllocationNotFoundError();
    if (allocation.status !== "ACTIVE") throw new InvalidAllocationStateError();
    return tx.capacityAllocation.update({ where: { id: allocation.id }, data: { status: input.outcome, releasedAt: new Date(), releaseReason: reason.slice(0, 500) } });
  });
}
