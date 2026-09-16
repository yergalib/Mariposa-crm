import "server-only";

import type {
  BulkPhysicalResolutionKind,
  BulkPhysicalResolutionOutcome,
  BulkPhysicalResolutionProvenance,
  BulkMaintenanceEventType,
  Prisma
} from "@/generated/prisma/client";
import { InventoryError } from "@/lib/inventory/errors";

export type BulkResolutionLineInput = {
  outcome: BulkPhysicalResolutionOutcome;
  quantity: number;
  note?: string | null;
};

export type CreateBulkResolutionInput = {
  organizationId: string;
  branchId: string;
  locationId?: string | null;
  orderId: string;
  orderItemId: string;
  capacityAllocationId: string;
  productVariantId: string;
  kind: BulkPhysicalResolutionKind;
  provenance?: BulkPhysicalResolutionProvenance;
  idempotencyKey: string;
  occurredAt: Date;
  actorUserId?: string | null;
  note?: string | null;
  lines: BulkResolutionLineInput[];
};

function normalizedLines(lines: BulkResolutionLineInput[]) {
  return lines.map((line) => ({ outcome: line.outcome, quantity: line.quantity, note: line.note?.trim() || null }))
    .sort((left, right) => left.outcome.localeCompare(right.outcome) || left.quantity - right.quantity || (left.note ?? "").localeCompare(right.note ?? ""));
}

export function validateBulkResolutionLines(kind: BulkPhysicalResolutionKind, lines: BulkResolutionLineInput[]) {
  if (!lines.length || lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0)) {
    throw new InventoryError("INVALID", "Количество физического разрешения должно быть положительным.");
  }
  const allowed = kind === "RETURN"
    ? new Set<BulkPhysicalResolutionOutcome>(["GOOD", "NEEDS_CLEANING", "DAMAGED", "LEGACY_UNKNOWN"])
    : new Set<BulkPhysicalResolutionOutcome>(["LOST"]);
  if (lines.some((line) => !allowed.has(line.outcome))) {
    throw new InventoryError("INVALID", "Результат не соответствует типу физической операции.");
  }
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export async function createBulkPhysicalResolution(tx: Prisma.TransactionClient, input: CreateBulkResolutionInput) {
  const totalQuantity = validateBulkResolutionLines(input.kind, input.lines);
  const existing = await tx.bulkPhysicalResolution.findUnique({
    where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } },
    include: { lines: true }
  });
  if (existing) {
    const same = existing.branchId === input.branchId
      && existing.locationId === (input.locationId ?? null)
      && existing.orderId === input.orderId
      && existing.orderItemId === input.orderItemId
      && existing.capacityAllocationId === input.capacityAllocationId
      && existing.productVariantId === input.productVariantId
      && existing.kind === input.kind
      && existing.provenance === (input.provenance ?? "RECORDED")
      && existing.totalQuantity === totalQuantity
      && JSON.stringify(normalizedLines(existing.lines)) === JSON.stringify(normalizedLines(input.lines));
    if (!same) throw new InventoryError("INVALID", "Ключ повторной операции уже использован с другими данными.");
    return existing;
  }
  return tx.bulkPhysicalResolution.create({
    data: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      locationId: input.locationId ?? null,
      orderId: input.orderId,
      orderItemId: input.orderItemId,
      capacityAllocationId: input.capacityAllocationId,
      productVariantId: input.productVariantId,
      kind: input.kind,
      provenance: input.provenance ?? "RECORDED",
      totalQuantity,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt,
      actorUserId: input.actorUserId ?? null,
      note: input.note?.trim() || null,
      lines: { create: input.lines.map((line) => ({
        organizationId: input.organizationId,
        productVariantId: input.productVariantId,
        outcome: line.outcome,
        quantity: line.quantity,
        note: line.note?.trim() || null
      })) }
    },
    include: { lines: true }
  });
}

export async function createBulkMaintenanceEvent(tx: Prisma.TransactionClient, input: {
  organizationId: string;
  branchId: string;
  capacityAllocationId: string;
  relatedAllocationId?: string | null;
  productVariantId: string;
  type: BulkMaintenanceEventType;
  quantity: number;
  idempotencyKey: string;
  occurredAt: Date;
  actorUserId?: string | null;
  note?: string | null;
}) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new InventoryError("INVALID", "Количество события обслуживания должно быть положительным.");
  }
  const existing = await tx.bulkMaintenanceEvent.findUnique({
    where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } }
  });
  if (existing) {
    const same = existing.branchId === input.branchId
      && existing.capacityAllocationId === input.capacityAllocationId
      && existing.relatedAllocationId === (input.relatedAllocationId ?? null)
      && existing.productVariantId === input.productVariantId
      && existing.type === input.type
      && existing.quantity === input.quantity;
    if (!same) throw new InventoryError("INVALID", "Ключ события обслуживания уже использован с другими данными.");
    return existing;
  }
  return tx.bulkMaintenanceEvent.create({ data: {
    organizationId: input.organizationId,
    branchId: input.branchId,
    capacityAllocationId: input.capacityAllocationId,
    relatedAllocationId: input.relatedAllocationId ?? null,
    productVariantId: input.productVariantId,
    type: input.type,
    quantity: input.quantity,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt,
    actorUserId: input.actorUserId ?? null,
    note: input.note?.trim() || null
  } });
}
