import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { defaultHasPermission, isPermissionKey } from "@/lib/permissions/registry";
import { appendAuditLog } from "@/lib/audit/log";
import { orderStatusLabel } from "@/lib/ui/labels";
import { rentalSnapshotSchema, rentalSnapshotHash } from "./document-snapshot";

export class RentalDocumentError extends Error {}
export function documentsNotInstalled(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}
type Client = typeof db | Prisma.TransactionClient;

async function authorizedScope(client: Client, session: AuthContext, write = false, customerRead = false) {
  // Check current membership/overrides inside the snapshot transaction as well as at the route.
  const member = await client.organizationMembership.findFirst({
    where: { id: session.membershipId, organizationId: session.organizationId, userId: session.userId,
      status: "ACTIVE", organization: { status: "ACTIVE" }, user: { status: "ACTIVE" } },
    select: { role: true, permissionOverrides: { select: { permissionKey: true, effect: true } },
      branchAccess: { where: { branch: { status: "ACTIVE" } }, select: { branchId: true } } }
  });
  if (!member) throw new RentalDocumentError("Доступ сотрудника не найден.");
  const required = [...(write ? ["ORDER_VIEW", "ORDER_EDIT"] as const : ["ORDER_VIEW"] as const),
    ...(customerRead ? ["CUSTOMER_VIEW"] as const : [])];
  for (const key of required) {
    let allowed = member.role === "OWNER" || defaultHasPermission(member.role, key);
    if (member.role !== "OWNER") for (const override of member.permissionOverrides) {
      if (isPermissionKey(override.permissionKey) && override.permissionKey === key) allowed = override.effect === "ALLOW";
    }
    if (!allowed) throw new RentalDocumentError("Недостаточно прав для работы с документом.");
  }
  return { organizationId: session.organizationId,
    branchId: member.role === "OWNER" ? undefined : { in: member.branchAccess.map(row => row.branchId) },
    branch: { organizationId: session.organizationId, status: "ACTIVE" as const } };
}

export async function listRentalDocuments(session: AuthContext, orderId: string) {
  await requirePermission(session, "ORDER_VIEW");
  if (!z.string().uuid().safeParse(orderId).success) return null;
  const scope = await authorizedScope(db, session);
  const order = await db.order.findFirst({ where: { ...scope, id: orderId, type: "RENTAL" }, select: { orderNumber: true } });
  if (!order) return null;
  const versions = await db.rentalDocumentVersion.findMany({
    where: { ...scope, orderId },
    select: { id: true, version: true, createdAt: true, revisionReason: true },
    orderBy: { version: "desc" }, take: 100
  });
  return { orderNumber: order.orderNumber, versions };
}

// Customer list metadata only: never load snapshots, financial fields or revision notes.
export async function listCustomerRentalDocuments(session: AuthContext, customerId: string, after?: string) {
  await requirePermission(session, "CUSTOMER_VIEW");
  await requirePermission(session, "ORDER_VIEW");
  if (!z.string().uuid().safeParse(customerId).success) return null;
  const scope = await authorizedScope(db, session, false, true);
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId: session.organizationId }, select: { id: true }
  });
  if (!customer) return null;
  const where = { ...scope, order: { ...scope, customerId, type: "RENTAL" as const } };
  let boundary;
  if (after !== undefined) {
    if (!z.string().uuid().safeParse(after).success) throw new RentalDocumentError("Недопустимая страница документов.");
    boundary = await db.rentalDocumentVersion.findFirst({ where: { ...where, id: after }, select: { id: true, createdAt: true } });
    if (!boundary) throw new RentalDocumentError("Страница документов недоступна. Вернитесь к началу списка.");
  }
  const rows = await db.rentalDocumentVersion.findMany({
    where: { ...where, ...(boundary ? { OR: [
      { createdAt: { lt: boundary.createdAt } },
      { createdAt: boundary.createdAt, id: { lt: boundary.id } }
    ] } : {}) },
    select: { id: true, orderId: true, version: true, createdAt: true,
      order: { select: { orderNumber: true } }, branch: { select: { name: true, timezone: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21
  });
  const versions = rows.slice(0, 20);
  return { versions, nextCursor: rows.length > 20 ? versions[versions.length - 1].id : null };
}

export async function getRentalDocument(session: AuthContext, orderId: string, documentId: string) {
  await requirePermission(session, "ORDER_VIEW");
  if (![orderId, documentId].every(id => z.string().uuid().safeParse(id).success)) return null;
  const scope = await authorizedScope(db, session);
  return db.rentalDocumentVersion.findFirst({
    where: { ...scope, id: documentId, orderId, order: { organizationId: session.organizationId, type: "RENTAL" } },
    select: { id: true, version: true, schemaVersion: true, templateVersion: true, snapshot: true,
      contentHash: true, revisionReason: true }
  });
}

const saveInput = z.object({
  orderId: z.string().uuid(), idempotencyKey: z.string().uuid(),
  baseVersion: z.number().int().min(0).max(2147483646), reason: z.string().trim().max(500)
});

export async function saveRentalDocument(session: AuthContext, raw: z.input<typeof saveInput>) {
  await requirePermission(session, "ORDER_VIEW");
  await requirePermission(session, "ORDER_EDIT");
  const parsed = saveInput.safeParse(raw);
  if (!parsed.success) throw new RentalDocumentError("Проверьте форму: причина должна содержать не более 500 символов.");
  const input = parsed.data;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const scope = await authorizedScope(tx, session, true);
        const order = await tx.order.findFirst({
          where: { ...scope, id: input.orderId, type: "RENTAL" },
          select: { id: true, branchId: true, orderNumber: true, status: true, rentalStartAt: true, rentalEndAt: true,
            customer: { select: { firstName: true, lastName: true, middleName: true } },
            branch: { select: { name: true, timezone: true } } }
        });
        if (!order) throw new RentalDocumentError("Заказ недоступен.");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${session.organizationId + ":rental-document:" + order.id}, 0))`;
        const previousRequest = await tx.rentalDocumentVersion.findUnique({ where: {
          organizationId_orderId_idempotencyKey: { organizationId: session.organizationId, orderId: order.id, idempotencyKey: input.idempotencyKey }
        } });
        if (previousRequest) {
          if (previousRequest.createdByUserId !== session.userId || (previousRequest.revisionReason ?? "") !== input.reason
            || previousRequest.version !== input.baseVersion + 1) throw new RentalDocumentError("Повторный запрос отличается от сохранённого. Обновите страницу.");
          return previousRequest.id;
        }
        const latest = await tx.rentalDocumentVersion.findFirst({
          where: { organizationId: session.organizationId, orderId: order.id }, orderBy: { version: "desc" }, select: { version: true }
        });
        if ((latest?.version ?? 0) !== input.baseVersion) throw new RentalDocumentError("Уже сохранена новая версия. Обновите страницу и проверьте документ.");
        if (latest && !input.reason) throw new RentalDocumentError("Укажите причину создания новой версии.");
        const items = await tx.orderItem.findMany({
          where: { organizationId: session.organizationId, orderId: order.id,
            OR: [{ removedAt: null }, { capacityAllocations: { some: { organizationId: session.organizationId, sourceType: "ORDER", issuedAt: { not: null } } } }] },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, productNameSnapshot: true, variantNameSnapshot: true, skuSnapshot: true, quantity: true, removedAt: true,
            productVariant: { select: { product: { select: { trackingMode: true } } } },
            capacityAllocations: {
              where: { organizationId: session.organizationId, sourceType: "ORDER", OR: [{ status: "ACTIVE" }, { issuedAt: { not: null } }] },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: { id: true, issuedQuantity: true, returnedQuantity: true, issuedAt: true, returnedAt: true,
                returnInspectionResult: true, returnNote: true, productInstance: { select: { inventoryNumber: true } },
                bulkPhysicalResolutions: { where: { organizationId: session.organizationId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
                  select: { id: true, kind: true, occurredAt: true,
                    lines: { where: { organizationId: session.organizationId }, orderBy: { id: "asc" }, select: { outcome: true, quantity: true, note: true } } } }
              }
            }
          }
        });
        const capturedAt = new Date();
        const snapshot = rentalSnapshotSchema.parse({
          schemaVersion: 1, templateVersion: 1, capturedAt: capturedAt.toISOString(),
          orderNumber: order.orderNumber, orderStatusLabel: orderStatusLabel(order.status),
          customerName: [order.customer.lastName, order.customer.firstName, order.customer.middleName].filter(Boolean).join(" "),
          branchName: order.branch.name, timezone: order.branch.timezone,
          rentalStartAt: order.rentalStartAt?.toISOString() ?? null, rentalEndAt: order.rentalEndAt?.toISOString() ?? null,
          items: items.map(item => ({
            sourceItemId: item.id, name: item.productNameSnapshot, variant: item.variantNameSnapshot, sku: item.skuSnapshot,
            trackingMode: item.productVariant.product.trackingMode, quantity: item.quantity, removed: item.removedAt !== null,
            allocations: item.capacityAllocations.map(allocation => ({
              sourceAllocationId: allocation.id,
              inventoryNumber: item.productVariant.product.trackingMode === "SERIALIZED" ? allocation.productInstance?.inventoryNumber ?? null : null,
              issuedQuantity: allocation.issuedQuantity, returnedQuantity: allocation.returnedQuantity,
              issuedAt: allocation.issuedAt?.toISOString() ?? null, returnedAt: allocation.returnedAt?.toISOString() ?? null,
              inspection: allocation.returnInspectionResult, returnNote: allocation.returnNote,
              resolutions: allocation.bulkPhysicalResolutions.map(resolution => ({
                sourceId: resolution.id, kind: resolution.kind, occurredAt: resolution.occurredAt.toISOString(), lines: resolution.lines
              }))
            }))
          }))
        });
        const saved = await tx.rentalDocumentVersion.create({ data: {
          organizationId: session.organizationId, branchId: order.branchId, orderId: order.id,
          version: (latest?.version ?? 0) + 1, createdByUserId: session.userId, createdAt: capturedAt,
          schemaVersion: 1, templateVersion: 1, snapshot, contentHash: rentalSnapshotHash(snapshot),
          idempotencyKey: input.idempotencyKey, revisionReason: input.reason || null
        }, select: { id: true } });
        await appendAuditLog(tx, { organizationId: session.organizationId, branchId: order.branchId,
          actorUserId: session.userId, actorMembershipId: session.membershipId,
          action: "RENTAL_DOCUMENT_SAVED", entityType: "RentalDocumentVersion", entityId: saved.id,
          metadata: { itemCount: items.length } });
        return saved.id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
    } catch (error) {
      // Waiting on the document lock can leave a stale serializable snapshot; retry the whole transaction.
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
        if (attempt < 2) continue;
        throw new RentalDocumentError("Документ сохраняется другим запросом. Повторите отправку или обновите страницу.");
      }
      throw error;
    }
  }
  throw new RentalDocumentError("Не удалось сохранить документ.");
}
