import "server-only";

import type { AllocationSourceType, BulkMaintenanceKind, Prisma } from "@/generated/prisma/client";
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
import { lockCapacityResource, lockCapacityResources } from "@/lib/inventory/capacity-lock";

const PERMANENTLY_UNAVAILABLE = ["SOLD", "WRITTEN_OFF", "LOST"] as const;
const TEMPORARILY_UNAVAILABLE = ["PICKING", "READY_FOR_PICKUP", "RENTED", "RETURN_INSPECTION", "CLEANING", "REPAIR", "IN_TRANSFER"] as const;
const OPEN_ENDED_SOURCES: AllocationSourceType[] = ["MAINTENANCE", "MANUAL_BLOCK"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DatabaseClient = typeof db | Prisma.TransactionClient;

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
  maintenanceKind?: BulkMaintenanceKind;
  maintenanceLocationId?: string;
  bulkSourceResolutionLineId?: string;
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

type CapacitySegment = { from: Date; until: Date | null; quantity: number };
type CapacityAllocationSnapshot = {
  id: string;
  sourceType: AllocationSourceType;
  quantity: number;
  blockedFrom: Date;
  blockedUntil: Date | null;
  issuedQuantity: number;
  returnedQuantity: number;
};

export function calculatePeakBlockedCapacity(segments: CapacitySegment[], from: Date, until: Date | null) {
  const deltas = new Map<number, number>();
  for (const segment of segments) {
    if (segment.quantity <= 0) continue;
    const clippedFrom = Math.max(segment.from.getTime(), from.getTime());
    const clippedUntil = until
      ? Math.min(segment.until?.getTime() ?? Number.POSITIVE_INFINITY, until.getTime())
      : segment.until?.getTime() ?? Number.POSITIVE_INFINITY;
    if (clippedFrom >= clippedUntil) continue;
    deltas.set(clippedFrom, (deltas.get(clippedFrom) ?? 0) + segment.quantity);
    if (Number.isFinite(clippedUntil)) {
      deltas.set(clippedUntil, (deltas.get(clippedUntil) ?? 0) - segment.quantity);
    }
  }
  let blocked = 0;
  let peak = 0;
  for (const timestamp of [...deltas.keys()].sort((a, b) => a - b)) {
    blocked += deltas.get(timestamp) ?? 0;
    peak = Math.max(peak, blocked);
  }
  return peak;
}

export function buildCapacitySegments(
  allocations: CapacityAllocationSnapshot[],
  trackingMode: "SERIALIZED" | "BULK",
  lossByAllocation: ReadonlyMap<string, number> = new Map(),
  terminalMaintenanceByAllocation: ReadonlyMap<string, number> = new Map()
) {
  const segments: CapacitySegment[] = [];
  for (const allocation of allocations) {
    if (allocation.sourceType === "MAINTENANCE") {
      const remaining = Math.max(0, allocation.quantity - (terminalMaintenanceByAllocation.get(allocation.id) ?? 0));
      if (remaining) segments.push({ from: allocation.blockedFrom, until: null, quantity: remaining });
      continue;
    }
    segments.push({ from: allocation.blockedFrom, until: allocation.blockedUntil, quantity: allocation.quantity });
    if (trackingMode === "BULK" && allocation.blockedUntil) {
      const outstanding = Math.max(
        0,
        allocation.issuedQuantity - allocation.returnedQuantity - (lossByAllocation.get(allocation.id) ?? 0)
      );
      if (outstanding) segments.push({ from: allocation.blockedUntil, until: null, quantity: outstanding });
    }
  }
  return segments;
}

async function getBulkResolvedLossByAllocation(
  client: DatabaseClient,
  organizationId: string,
  allocationIds: string[]
) {
  if (!allocationIds.length) return new Map<string, number>();
  const rows = await client.bulkPhysicalResolution.findMany({
    where: { organizationId, capacityAllocationId: { in: allocationIds }, kind: "LOSS_RESOLUTION" },
    select: { capacityAllocationId: true, totalQuantity: true }
  });
  const result = new Map<string, number>();
  for (const row of rows) result.set(row.capacityAllocationId, (result.get(row.capacityAllocationId) ?? 0) + row.totalQuantity);
  return result;
}

async function calculateBlockedCapacity(
  client: DatabaseClient,
  input: { organizationId: string; branchId: string; productVariantId: string; from: Date; until: Date | null; trackingMode: "SERIALIZED" | "BULK" }
) {
  const allocations = await client.capacityAllocation.findMany({
    where: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      productVariantId: input.productVariantId,
      status: "ACTIVE",
      blockedFrom: input.until ? { lt: input.until } : undefined,
      OR: [
        { sourceType: "MAINTENANCE" },
        { blockedUntil: null },
        { blockedUntil: { gt: input.from } },
        ...(input.trackingMode === "BULK" ? [{ issuedQuantity: { gt: 0 } }] : [])
      ]
    },
    select: {
      id: true,
      sourceType: true,
      quantity: true,
      blockedFrom: true,
      blockedUntil: true,
      issuedQuantity: true,
      returnedQuantity: true
    }
  });
  const allocationIds = allocations.map((allocation) => allocation.id);
  // One interactive transaction owns one pg connection, so keep its queries
  // sequential instead of issuing concurrent work through the same client.
  const lossByAllocation = input.trackingMode === "BULK"
    ? await getBulkResolvedLossByAllocation(client, input.organizationId, allocationIds)
    : new Map<string, number>();
  const maintenanceEvents = allocationIds.length
    ? await client.bulkMaintenanceEvent.findMany({
        where: { organizationId: input.organizationId, capacityAllocationId: { in: allocationIds } },
        select: { capacityAllocationId: true, quantity: true }
      })
    : [];
  const terminalMaintenanceByAllocation = new Map<string, number>();
  for (const event of maintenanceEvents) {
    terminalMaintenanceByAllocation.set(
      event.capacityAllocationId,
      (terminalMaintenanceByAllocation.get(event.capacityAllocationId) ?? 0) + event.quantity
    );
  }
  const segments = buildCapacitySegments(allocations, input.trackingMode, lossByAllocation, terminalMaintenanceByAllocation);
  return calculatePeakBlockedCapacity(segments, input.from, input.until);
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

export async function getVariantAvailabilityWithClient(client: DatabaseClient, input: AvailabilityInput): Promise<VariantAvailability> {
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

  const onHandCapacity = context.trackingMode === "SERIALIZED"
    ? await client.productInstance.count({
        where: { organizationId, productVariantId: input.productVariantId, currentBranchId: input.branchId, retiredAt: null, operationalStatus: { notIn: [...PERMANENTLY_UNAVAILABLE] } }
      })
    : (await client.stockLevel.aggregate({
        where: { organizationId, productVariantId: input.productVariantId, branchId: input.branchId },
        _sum: { quantity: true }
      }))._sum.quantity ?? 0;
  const issuedAllocations = context.trackingMode === "BULK" ? await client.capacityAllocation.findMany({
    where: { organizationId, branchId: input.branchId, productVariantId: input.productVariantId, issuedQuantity: { gt: 0 } },
    select: { id: true, issuedQuantity: true, returnedQuantity: true }
  }) : [];
  const lossByAllocation = context.trackingMode === "BULK"
    ? await getBulkResolvedLossByAllocation(client, organizationId, issuedAllocations.map((allocation) => allocation.id))
    : new Map<string, number>();
  const issuedOutstanding = issuedAllocations.reduce((sum, allocation) => sum + Math.max(
    0,
    allocation.issuedQuantity - allocation.returnedQuantity - (lossByAllocation.get(allocation.id) ?? 0)
  ), 0);
  const totalCapacity = onHandCapacity + issuedOutstanding;

  const reservedCapacity = await calculateBlockedCapacity(client, {
    organizationId,
    branchId: input.branchId,
    productVariantId: input.productVariantId,
    from: interval.effectiveBlockedFrom,
    until: interval.effectiveBlockedUntil,
    trackingMode: context.trackingMode
  });

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

export async function reserveOrderItemsWithClient(
  tx: Prisma.TransactionClient,
  input: {
    tenant: TenantContext;
    branchId: string;
    orderId: string;
    requestedFrom: Date;
    requestedUntil: Date;
    items: Array<{ id: string; productVariantId: string; quantity: number }>;
    replaceExisting?: boolean;
  }
) {
  assertResourceIds(input.tenant.organizationId, input.branchId, input.orderId);
  calculateEffectiveInterval({ requestedFrom: input.requestedFrom, requestedUntil: input.requestedUntil, turnaroundBufferMinutes: 0, allowOpenEnded: false });
  for (const item of input.items) {
    assertResourceIds(item.id, item.productVariantId);
    assertPositiveQuantity(item.quantity);
  }
  const organizationId = input.tenant.organizationId;
  await lockCapacityResources(tx, input.items.map((item) => ({ organizationId, branchId: input.branchId, productVariantId: item.productVariantId })));
  if (input.replaceExisting) {
    await tx.capacityAllocation.updateMany({
      where: { organizationId, orderId: input.orderId, status: "ACTIVE" },
      data: { status: "RELEASED", releasedAt: new Date(), releaseReason: "ORDER_RESERVATION_REPLACED" }
    });
  }
  const allocations = [];
  for (const item of input.items) {
    const orderItem = await tx.orderItem.findFirst({
      where: { id: item.id, organizationId, orderId: input.orderId, productVariantId: item.productVariantId, order: { branchId: input.branchId } },
      select: { id: true }
    });
    if (!orderItem) throw new ResourceNotFoundError();
    const availability = await getVariantAvailabilityWithClient(tx, {
      tenant: input.tenant, branchId: input.branchId, productVariantId: item.productVariantId,
      requestedFrom: input.requestedFrom, requestedUntil: input.requestedUntil, requestedQuantity: item.quantity
    });
    if (!availability.canFulfill) throw new InsufficientCapacityError(availability.availableCapacity, item.quantity);
    allocations.push(await tx.capacityAllocation.create({ data: {
      organizationId, branchId: input.branchId, orderId: input.orderId, orderItemId: item.id,
      productVariantId: item.productVariantId, sourceType: "ORDER", quantity: item.quantity,
      blockedFrom: availability.effectiveBlockedFrom, blockedUntil: availability.effectiveBlockedUntil, status: "ACTIVE"
    }}));
  }
  return allocations;
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
  if (input.maintenanceLocationId) assertResourceIds(input.maintenanceLocationId);
  if (input.bulkSourceResolutionLineId) assertResourceIds(input.bulkSourceResolutionLineId);
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
      await lockCapacityResource(tx, organizationId, input.branchId, input.productVariantId);
      const context = await getVariantContext(tx, organizationId, input.branchId, input.productVariantId);
      if (input.sourceType === "MAINTENANCE" && context.trackingMode === "BULK"
        && (!input.maintenanceKind || !input.maintenanceLocationId || !input.bulkSourceResolutionLineId)) {
        throw new ResourceNotFoundError();
      }
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
        data: { organizationId, branchId: input.branchId, productVariantId: input.productVariantId, productInstanceId: input.productInstanceId, orderId: resolvedOrderId, orderItemId: input.orderItemId, sourceType: input.sourceType, sourceReferenceId: input.sourceReferenceId, quantity: input.quantity, blockedFrom: interval.effectiveBlockedFrom, blockedUntil: interval.effectiveBlockedUntil, assignedByUserId: input.assignedByUserId, status: "ACTIVE", maintenanceKind: input.maintenanceKind, maintenanceLocationId: input.maintenanceLocationId, bulkSourceResolutionLineId: input.bulkSourceResolutionLineId }
      });
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (isDatabaseExclusionViolation(error)) throw new InstanceUnavailableError();
    throw error;
  }
}

async function getOpenEndedAvailability(client: DatabaseClient, input: ReserveCapacityInput, trackingMode: "SERIALIZED" | "BULK") {
  const organizationId = input.tenant.organizationId;
  const onHandCapacity = trackingMode === "SERIALIZED"
    ? await client.productInstance.count({ where: { organizationId, productVariantId: input.productVariantId, currentBranchId: input.branchId, retiredAt: null, operationalStatus: { notIn: [...PERMANENTLY_UNAVAILABLE] } } })
    : (await client.stockLevel.aggregate({ where: { organizationId, productVariantId: input.productVariantId, branchId: input.branchId }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const issuedAllocations = trackingMode === "BULK" ? await client.capacityAllocation.findMany({
    where: { organizationId, branchId: input.branchId, productVariantId: input.productVariantId, issuedQuantity: { gt: 0 } },
    select: { id: true, issuedQuantity: true, returnedQuantity: true }
  }) : [];
  const lossByAllocation = trackingMode === "BULK"
    ? await getBulkResolvedLossByAllocation(client, organizationId, issuedAllocations.map((allocation) => allocation.id))
    : new Map<string, number>();
  const issuedOutstanding = issuedAllocations.reduce((sum, allocation) => sum + Math.max(
    0,
    allocation.issuedQuantity - allocation.returnedQuantity - (lossByAllocation.get(allocation.id) ?? 0)
  ), 0);
  const totalCapacity = onHandCapacity + issuedOutstanding;
  const reservedCapacity = await calculateBlockedCapacity(client, {
    organizationId,
    branchId: input.branchId,
    productVariantId: input.productVariantId,
    from: input.requestedFrom,
    until: null,
    trackingMode
  });
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
      await lockCapacityResource(tx, organizationId, allocation.branchId, allocation.productVariantId);
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
