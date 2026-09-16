import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { appendAuditLog } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { authorizeBulkOperation, type BulkOperationalActor } from "@/lib/fulfillment/bulk-authorization";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import { createBulkMaintenanceEvent } from "@/lib/inventory/bulk-foundation";
import { lockCapacityResource } from "@/lib/inventory/capacity-lock";
import { movement } from "@/lib/inventory/ledger";
import type { TenantContext } from "@/lib/tenant/context";

type MaintenanceInput = {
  allocationId: string;
  quantity: number;
  destinationLocationId: string;
  idempotencyKey: string;
  note?: string | null;
  occurredAt?: Date;
};

type TransitionInput = {
  allocationId: string;
  quantity: number;
  repairLocationId: string;
  idempotencyKey: string;
  note?: string | null;
  occurredAt?: Date;
};

type LoadedMaintenance = {
  id: string;
  organizationId: string;
  branchId: string;
  productVariantId: string;
  quantity: number;
  status: string;
  blockedFrom: Date;
  maintenanceKind: "CLEANING" | "REPAIR" | null;
  maintenanceLocationId: string | null;
  bulkMaintenanceEvents: Array<{ id: string; type: string; quantity: number }>;
  sourceContext: { orderId: string; orderItemId: string } | null;
};

function validateQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new FulfillmentError("INVALID_STATE", "Количество обслуживания должно быть положительным.");
  }
}

function remainingQuantity(allocation: LoadedMaintenance) {
  return allocation.quantity - allocation.bulkMaintenanceEvents.reduce((sum, event) => sum + event.quantity, 0);
}

function sourceOrder(allocation: LoadedMaintenance) {
  return allocation.sourceContext;
}

async function moveMaintenanceStock(tx: Prisma.TransactionClient, input: {
  organizationId: string;
  branchId: string;
  productVariantId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  eventId: string;
  idempotencyKey: string;
  userId: string;
  reason: string | null;
}) {
  const source = await tx.stockLevel.findFirst({
    where: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      productVariantId: input.productVariantId,
      locationId: input.fromLocationId
    }
  });
  if (!source || source.quantity < input.quantity) {
    throw new FulfillmentError("DATA_INTEGRITY", "Физический остаток обслуживания меньше указанного количества.");
  }
  let destination = await tx.stockLevel.findFirst({
    where: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      productVariantId: input.productVariantId,
      locationId: input.toLocationId
    }
  });
  await tx.stockLevel.update({ where: { id: source.id }, data: { quantity: { decrement: input.quantity } } });
  destination = destination
    ? await tx.stockLevel.update({ where: { id: destination.id }, data: { quantity: { increment: input.quantity } } })
    : await tx.stockLevel.create({ data: {
        organizationId: input.organizationId,
        branchId: input.branchId,
        productVariantId: input.productVariantId,
        locationId: input.toLocationId,
        quantity: input.quantity
      } });
  await movement(tx, {
    organizationId: input.organizationId,
    productVariantId: input.productVariantId,
    type: "TRANSFER",
    quantity: input.quantity,
    fromBranchId: input.branchId,
    fromLocationId: input.fromLocationId,
    toBranchId: input.branchId,
    toLocationId: input.toLocationId,
    sourceType: "BULK_MAINTENANCE_EVENT",
    sourceId: input.eventId,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
    bulkMaintenanceEventId: input.eventId,
    createdByUserId: input.userId
  });
  return destination;
}

async function initialMaintenance(tx: Prisma.TransactionClient, tenant: TenantContext, allocationId: string) {
  return tx.capacityAllocation.findFirst({
    where: {
      id: allocationId,
      organizationId: tenant.organizationId,
      sourceType: "MAINTENANCE",
      productInstanceId: null,
      productVariant: { product: { trackingMode: "BULK" } }
    },
    select: { id: true, branchId: true, productVariantId: true }
  });
}

async function loadMaintenance(tx: Prisma.TransactionClient, tenant: TenantContext, allocationId: string) {
  const allocation = await tx.capacityAllocation.findFirst({
    where: {
      id: allocationId,
      organizationId: tenant.organizationId,
      sourceType: "MAINTENANCE",
      productInstanceId: null,
      productVariant: { product: { trackingMode: "BULK" } }
    },
    select: {
      id: true,
      organizationId: true,
      branchId: true,
      productVariantId: true,
      quantity: true,
      status: true,
      blockedFrom: true,
      maintenanceKind: true,
      maintenanceLocationId: true,
      bulkSourceResolutionLineId: true,
      parentMaintenanceAllocationId: true
    }
  });
  if (!allocation) return null;
  let sourceLineId = allocation.bulkSourceResolutionLineId;
  if (!sourceLineId && allocation.parentMaintenanceAllocationId) {
    sourceLineId = (await tx.capacityAllocation.findUnique({
      where: { id: allocation.parentMaintenanceAllocationId },
      select: { bulkSourceResolutionLineId: true }
    }))?.bulkSourceResolutionLineId ?? null;
  }
  const resolutionId = sourceLineId ? (await tx.bulkPhysicalResolutionLine.findUnique({
    where: { id: sourceLineId },
    select: { resolutionId: true }
  }))?.resolutionId : null;
  const sourceContext = resolutionId ? await tx.bulkPhysicalResolution.findUnique({
    where: { id: resolutionId },
    select: { orderId: true, orderItemId: true }
  }) : null;
  const bulkMaintenanceEvents = await tx.bulkMaintenanceEvent.findMany({
    where: { organizationId: tenant.organizationId, capacityAllocationId: allocation.id },
    select: { id: true, type: true, quantity: true }
  });
  return { ...allocation, bulkMaintenanceEvents, sourceContext };
}

async function auditMaintenance(tx: Prisma.TransactionClient, input: {
  tenant: TenantContext;
  actor: BulkOperationalActor;
  allocation: LoadedMaintenance;
  eventId: string;
  idempotencyKey: string;
  action: string;
  quantity: number;
  status: string;
  occurredAt: Date;
}) {
  const source = sourceOrder(input.allocation);
  if (source) {
    await tx.orderEvent.create({ data: {
      organizationId: input.tenant.organizationId,
      orderId: source.orderId,
      eventType: input.action,
      createdByUserId: input.actor.userId,
      payload: {
        orderItemId: source.orderItemId,
        maintenanceAllocationId: input.allocation.id,
        maintenanceEventId: input.eventId,
        quantity: input.quantity,
        maintenanceKind: input.allocation.maintenanceKind,
        occurredAt: input.occurredAt.toISOString()
      }
    } });
  }
  await appendAuditLog(tx, {
    organizationId: input.tenant.organizationId,
    branchId: input.allocation.branchId,
    actorUserId: input.actor.userId,
    actorMembershipId: input.actor.membershipId,
    action: input.action,
    entityType: "BulkMaintenanceEvent",
    entityId: input.eventId,
    correlationId: input.idempotencyKey,
    metadata: {
      quantity: input.quantity,
      branchId: input.allocation.branchId,
      trackingMode: "BULK",
      status: input.status
    },
    occurredAt: input.occurredAt
  });
}

export async function completeBulkMaintenance(
  tenant: TenantContext,
  input: MaintenanceInput,
  actor: BulkOperationalActor,
  transactionClient?: Prisma.TransactionClient
) {
  validateQuantity(input.quantity);
  const idempotencyKey = input.idempotencyKey.trim();
  const note = input.note?.trim().slice(0, 1000) || null;
  if (!idempotencyKey || !input.destinationLocationId) throw new FulfillmentError("INVALID_STATE", "Заполните данные обслуживания.");
  try {
    const execute = async (tx: Prisma.TransactionClient) => {
      await authorizeBulkOperation(tx, tenant, actor, "MAINTENANCE_COMPLETE");
      const initial = await initialMaintenance(tx, tenant, input.allocationId);
      if (!initial) throw new FulfillmentError("NOT_FOUND", "Активное обслуживание не найдено.");
      await authorizeBulkOperation(tx, tenant, actor, "MAINTENANCE_COMPLETE", initial.branchId);
      await lockCapacityResource(tx, tenant.organizationId, initial.branchId, initial.productVariantId);
      const allocation = await loadMaintenance(tx, tenant, input.allocationId);
      if (!allocation) throw new FulfillmentError("NOT_FOUND", "Активное обслуживание не найдено.");

      const existing = await tx.bulkMaintenanceEvent.findUnique({
        where: { organizationId_idempotencyKey: { organizationId: tenant.organizationId, idempotencyKey } }
      });
      if (existing) {
        const existingMovement = await tx.inventoryMovement.findFirst({
          where: { organizationId: tenant.organizationId, bulkMaintenanceEventId: existing.id },
          select: { toLocationId: true }
        });
        if (existing.capacityAllocationId !== allocation.id || existing.type !== "COMPLETED"
          || existing.quantity !== input.quantity || existing.relatedAllocationId !== null
          || existing.note !== note
          || existingMovement?.toLocationId !== input.destinationLocationId) {
          throw new FulfillmentError("CONFLICT", "Ключ обслуживания уже использован с другими данными.");
        }
        return { eventId: existing.id, allocationId: allocation.id, remainingQuantity: remainingQuantity(allocation) };
      }
      if (allocation.status !== "ACTIVE" || !allocation.maintenanceKind || !allocation.maintenanceLocationId) {
        throw new FulfillmentError("INVALID_STATE", "Обслуживание уже завершено или имеет некорректный контекст.");
      }
      const remaining = remainingQuantity(allocation);
      if (input.quantity > remaining) throw new FulfillmentError("INVALID_STATE", "Количество превышает остаток обслуживания.");
      const destination = await tx.location.findFirst({
        where: {
          id: input.destinationLocationId,
          organizationId: tenant.organizationId,
          branchId: allocation.branchId,
          isActive: true,
          type: { notIn: ["CLEANING", "REPAIR", "TRANSIT"] }
        },
        select: { id: true }
      });
      if (!destination) throw new FulfillmentError("INVALID_STATE", "Выберите доступную складскую локацию.");
      const now = input.occurredAt ?? new Date();
      const created = await createBulkMaintenanceEvent(tx, {
        organizationId: tenant.organizationId,
        branchId: allocation.branchId,
        capacityAllocationId: allocation.id,
        productVariantId: allocation.productVariantId,
        type: "COMPLETED",
        quantity: input.quantity,
        idempotencyKey,
        occurredAt: now,
        actorUserId: actor.userId,
        note
      });
      await moveMaintenanceStock(tx, {
        organizationId: tenant.organizationId,
        branchId: allocation.branchId,
        productVariantId: allocation.productVariantId,
        fromLocationId: allocation.maintenanceLocationId,
        toLocationId: destination.id,
        quantity: input.quantity,
        eventId: created.id,
        idempotencyKey: `bulk-maintenance-movement:${created.id}`,
        userId: actor.userId,
        reason: note
      });
      const remainingAfter = remaining - input.quantity;
      if (remainingAfter === 0) {
        await tx.capacityAllocation.update({
          where: { id: allocation.id },
          data: { status: "RELEASED", releasedAt: now, releaseReason: `${allocation.maintenanceKind}_COMPLETED` }
        });
      }
      await auditMaintenance(tx, {
        tenant, actor, allocation, eventId: created.id, idempotencyKey,
        action: "BULK_MAINTENANCE_COMPLETED", quantity: input.quantity,
        status: allocation.maintenanceKind, occurredAt: now
      });
      return { eventId: created.id, allocationId: allocation.id, remainingQuantity: remainingAfter };
    };
    return transactionClient
      ? await execute(transactionClient)
      : await db.$transaction(execute, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new FulfillmentError("CONFLICT", "Ключ обслуживания уже использован с другими данными.");
    }
    throw error;
  }
}

export async function transitionBulkCleaningToRepair(
  tenant: TenantContext,
  input: TransitionInput,
  actor: BulkOperationalActor,
  transactionClient?: Prisma.TransactionClient
) {
  validateQuantity(input.quantity);
  const idempotencyKey = input.idempotencyKey.trim();
  const note = input.note?.trim().slice(0, 1000) || null;
  if (!idempotencyKey || !input.repairLocationId) throw new FulfillmentError("INVALID_STATE", "Заполните данные перехода в ремонт.");
  try {
    const execute = async (tx: Prisma.TransactionClient) => {
      await authorizeBulkOperation(tx, tenant, actor, "MAINTENANCE_COMPLETE");
      const initial = await initialMaintenance(tx, tenant, input.allocationId);
      if (!initial) throw new FulfillmentError("NOT_FOUND", "Активная чистка не найдена.");
      await authorizeBulkOperation(tx, tenant, actor, "MAINTENANCE_COMPLETE", initial.branchId);
      await lockCapacityResource(tx, tenant.organizationId, initial.branchId, initial.productVariantId);
      const allocation = await loadMaintenance(tx, tenant, input.allocationId);
      if (!allocation) throw new FulfillmentError("NOT_FOUND", "Активная чистка не найдена.");

      const existing = await tx.bulkMaintenanceEvent.findUnique({
        where: { organizationId_idempotencyKey: { organizationId: tenant.organizationId, idempotencyKey } }
      });
      if (existing) {
        const relatedAllocation = existing.relatedAllocationId
          ? await tx.capacityAllocation.findUnique({ where: { id: existing.relatedAllocationId }, select: { maintenanceLocationId: true } })
          : null;
        if (existing.capacityAllocationId !== allocation.id || existing.type !== "TRANSITIONED"
          || existing.quantity !== input.quantity || existing.note !== note
          || relatedAllocation?.maintenanceLocationId !== input.repairLocationId) {
          throw new FulfillmentError("CONFLICT", "Ключ перехода уже использован с другими данными.");
        }
        return {
          eventId: existing.id,
          sourceAllocationId: allocation.id,
          repairAllocationId: existing.relatedAllocationId!,
          remainingCleaningQuantity: remainingQuantity(allocation)
        };
      }
      if (allocation.status !== "ACTIVE" || allocation.maintenanceKind !== "CLEANING" || !allocation.maintenanceLocationId) {
        throw new FulfillmentError("INVALID_STATE", "Перевести в ремонт можно только активную чистку.");
      }
      const remaining = remainingQuantity(allocation);
      if (input.quantity > remaining) throw new FulfillmentError("INVALID_STATE", "Количество превышает остаток чистки.");
      const repairLocation = await tx.location.findFirst({
        where: {
          id: input.repairLocationId,
          organizationId: tenant.organizationId,
          branchId: allocation.branchId,
          isActive: true,
          type: "REPAIR"
        },
        select: { id: true }
      });
      if (!repairLocation) throw new FulfillmentError("INVALID_STATE", "Выберите активную ремонтную локацию.");
      const now = input.occurredAt ?? new Date();
      const repairAllocation = await tx.capacityAllocation.create({ data: {
        organizationId: tenant.organizationId,
        branchId: allocation.branchId,
        productVariantId: allocation.productVariantId,
        quantity: input.quantity,
        sourceType: "MAINTENANCE",
        sourceReferenceId: allocation.id,
        blockedFrom: allocation.blockedFrom > now ? allocation.blockedFrom : now,
        blockedUntil: null,
        status: "ACTIVE",
        assignedByUserId: actor.userId,
        maintenanceKind: "REPAIR",
        maintenanceLocationId: repairLocation.id,
        parentMaintenanceAllocationId: allocation.id
      } });
      const created = await createBulkMaintenanceEvent(tx, {
        organizationId: tenant.organizationId,
        branchId: allocation.branchId,
        capacityAllocationId: allocation.id,
        relatedAllocationId: repairAllocation.id,
        productVariantId: allocation.productVariantId,
        type: "TRANSITIONED",
        quantity: input.quantity,
        idempotencyKey,
        occurredAt: now,
        actorUserId: actor.userId,
        note
      });
      await moveMaintenanceStock(tx, {
        organizationId: tenant.organizationId,
        branchId: allocation.branchId,
        productVariantId: allocation.productVariantId,
        fromLocationId: allocation.maintenanceLocationId,
        toLocationId: repairLocation.id,
        quantity: input.quantity,
        eventId: created.id,
        idempotencyKey: `bulk-maintenance-transition:${created.id}`,
        userId: actor.userId,
        reason: note
      });
      const remainingAfter = remaining - input.quantity;
      if (remainingAfter === 0) {
        await tx.capacityAllocation.update({
          where: { id: allocation.id },
          data: { status: "RELEASED", releasedAt: now, releaseReason: "CLEANING_TRANSITIONED_TO_REPAIR" }
        });
      }
      await auditMaintenance(tx, {
        tenant, actor, allocation, eventId: created.id, idempotencyKey,
        action: "BULK_CLEANING_TRANSITIONED_TO_REPAIR", quantity: input.quantity,
        status: "REPAIR", occurredAt: now
      });
      return {
        eventId: created.id,
        sourceAllocationId: allocation.id,
        repairAllocationId: repairAllocation.id,
        remainingCleaningQuantity: remainingAfter
      };
    };
    return transactionClient
      ? await execute(transactionClient)
      : await db.$transaction(execute, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new FulfillmentError("CONFLICT", "Ключ перехода уже использован с другими данными.");
    }
    throw error;
  }
}
