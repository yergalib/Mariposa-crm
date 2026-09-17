import "server-only";

import { Prisma, type BulkPhysicalResolutionOutcome } from "@/generated/prisma/client";
import { appendAuditLog } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { authorizeBulkOperation, type BulkOperationalActor } from "@/lib/fulfillment/bulk-authorization";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import { createBulkPhysicalResolution } from "@/lib/inventory/bulk-foundation";
import { lockCapacityResource } from "@/lib/inventory/capacity-lock";
import { returnBulkDispositionInventory } from "@/lib/inventory/ledger";
import type { TenantContext } from "@/lib/tenant/context";

export type ExplicitBulkReturnOutcome = Extract<
  BulkPhysicalResolutionOutcome,
  "GOOD" | "NEEDS_CLEANING" | "DAMAGED"
>;

export type BulkReturnDispositionInput = {
  outcome: ExplicitBulkReturnOutcome;
  quantity: number;
  locationId: string;
  note?: string | null;
};

export type RecordBulkReturnInput = {
  orderId: string;
  orderItemId: string;
  allocationId: string;
  dispositions: BulkReturnDispositionInput[];
  idempotencyKey: string;
  note?: string | null;
  occurredAt?: Date;
};

export type RecordBulkLossInput = {
  orderId: string;
  orderItemId: string;
  allocationId: string;
  quantity: number;
  idempotencyKey: string;
  reason: string;
  occurredAt?: Date;
};

const OUTCOME_ORDER: Record<ExplicitBulkReturnOutcome, number> = {
  GOOD: 0,
  NEEDS_CLEANING: 1,
  DAMAGED: 2
};

function normalizeDispositions(dispositions: BulkReturnDispositionInput[]) {
  const rows = dispositions
    .filter((row) => row.quantity !== 0)
    .map((row) => ({
      outcome: row.outcome,
      quantity: row.quantity,
      locationId: row.locationId.trim(),
      note: row.note?.trim().slice(0, 1000) || null
    }))
    .sort((left, right) => OUTCOME_ORDER[left.outcome] - OUTCOME_ORDER[right.outcome]);
  if (!rows.length || rows.some((row) => !Number.isInteger(row.quantity) || row.quantity <= 0 || !row.locationId)) {
    throw new FulfillmentError("INVALID_STATE", "Укажите положительное количество хотя бы для одного результата возврата.");
  }
  if (new Set(rows.map((row) => row.outcome)).size !== rows.length) {
    throw new FulfillmentError("INVALID_STATE", "Каждый результат возврата можно указать только один раз.");
  }
  return rows;
}

async function existingSemanticPayload(
  existing: Awaited<ReturnType<typeof loadExistingResolution>>
) {
  if (!existing) return [];
  return existing.lines.map((line) => {
    const locations = [...new Set(line.inventoryMovements.map((movement) => movement.toLocationId).filter(Boolean))];
    return {
      outcome: line.outcome,
      quantity: line.quantity,
      locationId: locations.length === 1 ? locations[0]! : null,
      note: line.note
    };
  }).sort((left, right) => (OUTCOME_ORDER[left.outcome as ExplicitBulkReturnOutcome] ?? 99)
    - (OUTCOME_ORDER[right.outcome as ExplicitBulkReturnOutcome] ?? 99));
}

async function loadExistingResolution(tx: Prisma.TransactionClient, organizationId: string, idempotencyKey: string) {
  const resolution = await tx.bulkPhysicalResolution.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
    select: { id: true, organizationId: true, orderId: true, orderItemId: true, capacityAllocationId: true, productVariantId: true, kind: true, provenance: true, totalQuantity: true, note: true }
  });
  if (!resolution) return null;
  const lines = await tx.bulkPhysicalResolutionLine.findMany({
    where: { organizationId, resolutionId: resolution.id },
    select: { id: true, outcome: true, quantity: true, note: true },
    orderBy: { createdAt: "asc" }
  });
  const lineIds = lines.map((line) => line.id);
  const movements = lineIds.length ? await tx.inventoryMovement.findMany({
    where: { organizationId, bulkResolutionLineId: { in: lineIds } },
    select: { bulkResolutionLineId: true, toLocationId: true }
  }) : [];
  const maintenanceAllocations = lineIds.length ? await tx.capacityAllocation.findMany({
    where: { organizationId, bulkSourceResolutionLineId: { in: lineIds } },
    select: { id: true, bulkSourceResolutionLineId: true, maintenanceKind: true, status: true }
  }) : [];
  return {
    ...resolution,
    lines: lines.map((line) => ({
      ...line,
      inventoryMovements: movements.filter((movement) => movement.bulkResolutionLineId === line.id),
      maintenanceAllocation: maintenanceAllocations.find((allocation) => allocation.bulkSourceResolutionLineId === line.id) ?? null
    }))
  };
}

function resultDto(
  resolution: NonNullable<Awaited<ReturnType<typeof loadExistingResolution>>>,
  outstandingAfter: number
) {
  return {
    resolutionId: resolution.id,
    orderId: resolution.orderId,
    orderItemId: resolution.orderItemId,
    allocationId: resolution.capacityAllocationId,
    returnedQuantity: resolution.totalQuantity,
    outstandingAfter,
    dispositions: resolution.lines.map((line) => ({
      outcome: line.outcome,
      quantity: line.quantity,
      maintenanceAllocationId: line.maintenanceAllocation?.id ?? null
    }))
  };
}

export async function recordBulkReturn(
  tenant: TenantContext,
  input: RecordBulkReturnInput,
  actor: BulkOperationalActor,
  transactionClient?: Prisma.TransactionClient
) {
  const dispositions = normalizeDispositions(input.dispositions);
  const totalQuantity = dispositions.reduce((sum, row) => sum + row.quantity, 0);
  const idempotencyKey = input.idempotencyKey.trim();
  const operationNote = input.note?.trim().slice(0, 1000) || null;
  if (!idempotencyKey) throw new FulfillmentError("INVALID_STATE", "Ключ операции обязателен.");

  try {
    const execute = async (tx: Prisma.TransactionClient) => {
      await authorizeBulkOperation(tx, tenant, actor, "RETURN_PROCESS");
      const initial = await tx.capacityAllocation.findFirst({
        where: {
          id: input.allocationId,
          organizationId: tenant.organizationId,
          orderId: input.orderId,
          orderItemId: input.orderItemId,
          sourceType: "ORDER",
          productInstanceId: null,
          orderItem: { removedAt: null, productVariant: { product: { trackingMode: "BULK" } } }
        },
        select: { branchId: true, productVariantId: true }
      });
      if (!initial) throw new FulfillmentError("NOT_FOUND", "Выданная BULK-позиция не найдена.");
      await authorizeBulkOperation(tx, tenant, actor, "RETURN_INSPECT", initial.branchId);
      await lockCapacityResource(tx, tenant.organizationId, initial.branchId, initial.productVariantId);

      const allocation = await tx.capacityAllocation.findFirst({
        where: {
          id: input.allocationId,
          organizationId: tenant.organizationId,
          branchId: initial.branchId,
          productVariantId: initial.productVariantId,
          orderId: input.orderId,
          orderItemId: input.orderItemId,
          sourceType: "ORDER",
          productInstanceId: null,
          issuedAt: { not: null },
          issuedQuantity: { gt: 0 },
          orderItem: { removedAt: null, productVariant: { product: { trackingMode: "BULK" } } }
        },
        include: { orderItem: { select: { id: true } } }
      });
      if (!allocation) throw new FulfillmentError("NOT_FOUND", "Выданная BULK-позиция не найдена.");

      const existing = await loadExistingResolution(tx, tenant.organizationId, idempotencyKey);
      if (existing) {
        const existingPayload = await existingSemanticPayload(existing);
        const same = existing.kind === "RETURN"
          && existing.provenance === "RECORDED"
          && existing.orderId === input.orderId
          && existing.orderItemId === input.orderItemId
          && existing.capacityAllocationId === input.allocationId
          && existing.productVariantId === allocation.productVariantId
          && existing.note === operationNote
          && JSON.stringify(existingPayload) === JSON.stringify(dispositions);
        if (!same) throw new FulfillmentError("CONFLICT", "Ключ возврата уже использован с другими данными.");
        const losses = await tx.bulkPhysicalResolution.aggregate({
          where: { organizationId: tenant.organizationId, capacityAllocationId: allocation.id, kind: "LOSS_RESOLUTION" },
          _sum: { totalQuantity: true }
        });
        return resultDto(existing, Math.max(0, allocation.issuedQuantity - allocation.returnedQuantity - (losses._sum.totalQuantity ?? 0)));
      }

      const locations = await tx.location.findMany({
        where: {
          organizationId: tenant.organizationId,
          branchId: allocation.branchId,
          id: { in: dispositions.map((row) => row.locationId) },
          isActive: true
        },
        select: { id: true, type: true }
      });
      const locationById = new Map(locations.map((location) => [location.id, location.type]));
      for (const disposition of dispositions) {
        const type = locationById.get(disposition.locationId);
        const valid = disposition.outcome === "GOOD"
          ? Boolean(type && !["CLEANING", "REPAIR", "TRANSIT"].includes(type))
          : disposition.outcome === "NEEDS_CLEANING"
            ? type === "CLEANING"
            : type === "REPAIR";
        if (!valid) throw new FulfillmentError("INVALID_STATE", "Выберите корректную локацию для каждого результата возврата.");
      }

      const losses = await tx.bulkPhysicalResolution.aggregate({
        where: { organizationId: tenant.organizationId, capacityAllocationId: allocation.id, kind: "LOSS_RESOLUTION" },
        _sum: { totalQuantity: true }
      });
      const resolvedLoss = losses._sum.totalQuantity ?? 0;
      const outstanding = allocation.issuedQuantity - allocation.returnedQuantity - resolvedLoss;
      if (totalQuantity > outstanding) {
        throw new FulfillmentError("INVALID_STATE", "Нельзя принять больше единиц, чем физически остаётся у клиента.");
      }

      const now = input.occurredAt ?? new Date();
      const uniqueLocations = [...new Set(dispositions.map((row) => row.locationId))];
      const created = await createBulkPhysicalResolution(tx, {
        organizationId: tenant.organizationId,
        branchId: allocation.branchId,
        locationId: uniqueLocations.length === 1 ? uniqueLocations[0] : null,
        orderId: input.orderId,
        orderItemId: input.orderItemId,
        capacityAllocationId: allocation.id,
        productVariantId: allocation.productVariantId,
        kind: "RETURN",
        provenance: "RECORDED",
        idempotencyKey,
        occurredAt: now,
        actorUserId: actor.userId,
        note: operationNote,
        lines: dispositions.map((row) => ({ outcome: row.outcome, quantity: row.quantity, note: row.note }))
      });

      let returnedOffset = allocation.returnedQuantity;
      for (const disposition of dispositions) {
        const line = created.lines.find((candidate) => candidate.outcome === disposition.outcome);
        if (!line) throw new FulfillmentError("DATA_INTEGRITY", "Не создана строка результата возврата.");
        await returnBulkDispositionInventory(tx, {
          organizationId: tenant.organizationId,
          branchId: allocation.branchId,
          locationId: disposition.locationId,
          variantId: allocation.productVariantId,
          allocationId: allocation.id,
          fromReturned: returnedOffset,
          quantity: disposition.quantity,
          userId: actor.userId,
          resolutionLineId: line.id
        });
        returnedOffset += disposition.quantity;
        if (disposition.outcome === "NEEDS_CLEANING" || disposition.outcome === "DAMAGED") {
          const blockedFrom = allocation.blockedUntil && allocation.blockedUntil > now ? allocation.blockedUntil : now;
          await tx.capacityAllocation.create({ data: {
            organizationId: tenant.organizationId,
            branchId: allocation.branchId,
            productVariantId: allocation.productVariantId,
            quantity: disposition.quantity,
            sourceType: "MAINTENANCE",
            sourceReferenceId: allocation.id,
            blockedFrom,
            blockedUntil: null,
            status: "ACTIVE",
            assignedByUserId: actor.userId,
            maintenanceKind: disposition.outcome === "NEEDS_CLEANING" ? "CLEANING" : "REPAIR",
            maintenanceLocationId: disposition.locationId,
            bulkSourceResolutionLineId: line.id
          } });
        }
      }

      const newReturnedQuantity = allocation.returnedQuantity + totalQuantity;
      await tx.capacityAllocation.update({
        where: { id: allocation.id },
        data: {
          returnedQuantity: newReturnedQuantity,
          returnedAt: newReturnedQuantity === allocation.issuedQuantity ? now : null,
          returnedByUserId: actor.userId
        }
      });
      const itemAllocations = await tx.capacityAllocation.findMany({
        where: { organizationId: tenant.organizationId, orderItemId: input.orderItemId, sourceType: "ORDER" },
        select: { issuedQuantity: true, returnedQuantity: true }
      });
      const itemIssued = itemAllocations.reduce((sum, row) => sum + row.issuedQuantity, 0);
      const itemReturned = itemAllocations.reduce((sum, row) => sum + row.returnedQuantity, 0);
      await tx.orderItem.update({
        where: { id: input.orderItemId },
        data: { status: itemReturned === 0 ? "ISSUED" : itemReturned < itemIssued ? "PARTIALLY_RETURNED" : "RETURNED" }
      });
      await tx.orderEvent.create({ data: {
        organizationId: tenant.organizationId,
        orderId: input.orderId,
        eventType: "BULK_RETURN_INSPECTED",
        createdByUserId: actor.userId,
        payload: {
          orderItemId: input.orderItemId,
          allocationId: allocation.id,
          resolutionId: created.id,
          returnedAt: now.toISOString(),
          dispositions: dispositions.map((row) => ({ outcome: row.outcome, quantity: row.quantity }))
        }
      } });
      await appendAuditLog(tx, {
        organizationId: tenant.organizationId,
        branchId: allocation.branchId,
        actorUserId: actor.userId,
        actorMembershipId: actor.membershipId,
        action: "BULK_RETURN_RECORDED",
        entityType: "BulkPhysicalResolution",
        entityId: created.id,
        correlationId: idempotencyKey,
        metadata: { quantity: totalQuantity, branchId: allocation.branchId, trackingMode: "BULK", status: "RETURN" },
        occurredAt: now
      });
      const resolution = await loadExistingResolution(tx, tenant.organizationId, idempotencyKey);
      if (!resolution) throw new FulfillmentError("DATA_INTEGRITY", "Возврат не удалось прочитать после сохранения.");
      return resultDto(resolution, outstanding - totalQuantity);
    };
    return transactionClient
      ? await execute(transactionClient)
      : await db.$transaction(execute, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new FulfillmentError("CONFLICT", "Ключ возврата уже использован с другими данными.");
    }
    throw error;
  }
}

export async function recordBulkLoss(
  tenant: TenantContext,
  input: RecordBulkLossInput,
  actor: BulkOperationalActor,
  transactionClient?: Prisma.TransactionClient
) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new FulfillmentError("INVALID_STATE", "Количество утраты должно быть положительным.");
  const idempotencyKey = input.idempotencyKey.trim(), reason = input.reason.trim().slice(0, 1000);
  if (!idempotencyKey || reason.length < 3) throw new FulfillmentError("INVALID_STATE", "Подтвердите утрату и укажите причину.");
  try {
    const execute = async (tx: Prisma.TransactionClient) => {
      await authorizeBulkOperation(tx, tenant, actor, "RETURN_PROCESS");
      await authorizeBulkOperation(tx, tenant, actor, "INVENTORY_WRITE_OFF");
      const initial = await tx.capacityAllocation.findFirst({ where: { id: input.allocationId, organizationId: tenant.organizationId, orderId: input.orderId, orderItemId: input.orderItemId, sourceType: "ORDER", productInstanceId: null, orderItem: { removedAt: null, productVariant: { product: { trackingMode: "BULK" } } } }, select: { branchId: true, productVariantId: true } });
      if (!initial) throw new FulfillmentError("NOT_FOUND", "Выданная BULK-позиция не найдена.");
      await authorizeBulkOperation(tx, tenant, actor, "RETURN_PROCESS", initial.branchId);
      await authorizeBulkOperation(tx, tenant, actor, "INVENTORY_WRITE_OFF", initial.branchId);
      await lockCapacityResource(tx, tenant.organizationId, initial.branchId, initial.productVariantId);
      const allocation = await tx.capacityAllocation.findFirst({ where: { id: input.allocationId, organizationId: tenant.organizationId, branchId: initial.branchId, productVariantId: initial.productVariantId, orderId: input.orderId, orderItemId: input.orderItemId, sourceType: "ORDER", productInstanceId: null, issuedAt: { not: null }, issuedQuantity: { gt: 0 } } });
      if (!allocation) throw new FulfillmentError("NOT_FOUND", "Выданная BULK-позиция не найдена.");
      const existing = await loadExistingResolution(tx, tenant.organizationId, idempotencyKey);
      if (existing) {
        const line = existing.lines[0];
        if (existing.kind !== "LOSS_RESOLUTION" || existing.provenance !== "RECORDED" || existing.orderId !== input.orderId || existing.orderItemId !== input.orderItemId || existing.capacityAllocationId !== input.allocationId || existing.productVariantId !== allocation.productVariantId || existing.totalQuantity !== input.quantity || existing.note !== reason || existing.lines.length !== 1 || line?.outcome !== "LOST" || line.quantity !== input.quantity) throw new FulfillmentError("CONFLICT", "Ключ утраты уже использован с другими данными.");
        const resolved = await tx.bulkPhysicalResolution.aggregate({ where: { organizationId: tenant.organizationId, capacityAllocationId: allocation.id, kind: "LOSS_RESOLUTION" }, _sum: { totalQuantity: true } });
        return { resolutionId: existing.id, allocationId: allocation.id, lostQuantity: existing.totalQuantity, outstandingAfter: Math.max(0, allocation.issuedQuantity - allocation.returnedQuantity - (resolved._sum.totalQuantity ?? 0)) };
      }
      const resolved = await tx.bulkPhysicalResolution.aggregate({ where: { organizationId: tenant.organizationId, capacityAllocationId: allocation.id, kind: "LOSS_RESOLUTION" }, _sum: { totalQuantity: true } });
      const outstanding = allocation.issuedQuantity - allocation.returnedQuantity - (resolved._sum.totalQuantity ?? 0);
      if (input.quantity > outstanding) throw new FulfillmentError("INVALID_STATE", "Нельзя списать как утраченное больше фактически не возвращённого количества.");
      const now = input.occurredAt ?? new Date();
      const created = await createBulkPhysicalResolution(tx, { organizationId: tenant.organizationId, branchId: allocation.branchId, orderId: input.orderId, orderItemId: input.orderItemId, capacityAllocationId: allocation.id, productVariantId: allocation.productVariantId, kind: "LOSS_RESOLUTION", provenance: "RECORDED", idempotencyKey, occurredAt: now, actorUserId: actor.userId, note: reason, lines: [{ outcome: "LOST", quantity: input.quantity, note: reason }] });
      const line = created.lines[0];
      if (!line) throw new FulfillmentError("DATA_INTEGRITY", "Не создана строка утраты.");
      await tx.inventoryMovement.create({ data: { organizationId: tenant.organizationId, productVariantId: allocation.productVariantId, type: "LOSS", quantity: -input.quantity, fromBranchId: allocation.branchId, sourceType: "BULK_PHYSICAL_RESOLUTION", sourceId: created.id, idempotencyKey: `bulk-loss:${line.id}`, reason, bulkResolutionLineId: line.id, createdByUserId: actor.userId, occurredAt: now } });
      const outstandingAfter = outstanding - input.quantity;
      const itemAllocations = await tx.capacityAllocation.findMany({ where: { organizationId: tenant.organizationId, orderItemId: input.orderItemId, sourceType: "ORDER" }, select: { id: true, issuedQuantity: true, returnedQuantity: true } });
      const allocationIds = itemAllocations.map(row => row.id);
      const itemLosses = allocationIds.length ? await tx.bulkPhysicalResolution.aggregate({ where: { organizationId: tenant.organizationId, capacityAllocationId: { in: allocationIds }, kind: "LOSS_RESOLUTION" }, _sum: { totalQuantity: true } }) : { _sum: { totalQuantity: 0 } };
      const itemIssued = itemAllocations.reduce((sum, row) => sum + row.issuedQuantity, 0), itemReturned = itemAllocations.reduce((sum, row) => sum + row.returnedQuantity, 0), itemResolved = itemReturned + (itemLosses._sum.totalQuantity ?? 0);
      await tx.orderItem.update({ where: { id: input.orderItemId }, data: { status: itemResolved < itemIssued ? (itemReturned > 0 ? "PARTIALLY_RETURNED" : "ISSUED") : (itemReturned === itemIssued ? "RETURNED" : "PARTIALLY_RETURNED") } });
      await tx.orderEvent.create({ data: { organizationId: tenant.organizationId, orderId: input.orderId, eventType: "BULK_LOSS_RESOLVED", createdByUserId: actor.userId, payload: { orderItemId: input.orderItemId, allocationId: allocation.id, resolutionId: created.id, quantity: input.quantity, occurredAt: now.toISOString() } } });
      await appendAuditLog(tx, { organizationId: tenant.organizationId, branchId: allocation.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "BULK_LOSS_RESOLVED", entityType: "BulkPhysicalResolution", entityId: created.id, correlationId: idempotencyKey, metadata: { quantity: input.quantity, branchId: allocation.branchId, trackingMode: "BULK", status: "LOST", reason }, occurredAt: now });
      return { resolutionId: created.id, allocationId: allocation.id, lostQuantity: input.quantity, outstandingAfter };
    };
    return transactionClient ? execute(transactionClient) : db.$transaction(execute, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new FulfillmentError("CONFLICT", "Ключ утраты уже использован с другими данными.");
    throw error;
  }
}
