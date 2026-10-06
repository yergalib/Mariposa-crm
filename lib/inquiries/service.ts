import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { hasPermission, requirePermission } from "@/lib/permissions/effective";
import { defaultHasPermission, type PermissionKey } from "@/lib/permissions/registry";
import { accessibleBranchIds, requireBranchAccess } from "@/lib/staff/branch-access";
import { createTenantContext } from "@/lib/tenant/context";
import { parseBusinessLocalDateTime } from "@/lib/calendar/timezone";
import { appendAuditLog } from "@/lib/audit/log";
import { createInquiryInput, updateInquiryInput, type InquiryFields, sourceSchema, statusSchema } from "./validation";

export class InquiryError extends Error {}
export function inquiriesNotInstalled(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}
async function scope(session: AuthContext, permission: PermissionKey = "LEAD_VIEW") {
  await requirePermission(session, "LEAD_VIEW");
  await requirePermission(session, permission);
  const ids = await accessibleBranchIds(createTenantContext(session.organizationId), session.membershipId);
  return { organizationId: session.organizationId, branchId: ids === null ? undefined : { in: ids },
    branch: { organizationId: session.organizationId, status: "ACTIVE" as const } };
}
const itemSelect = { id: true, productVariantId: true, nameSnapshot: true, skuSnapshot: true, sizeSnapshot: true } as const;
export async function getInquiry(session: AuthContext, id: string) {
  const allowed = await scope(session);
  if (!z.string().uuid().safeParse(id).success) return null;
  return db.inquiry.findFirst({ where: { ...allowed, id }, include: {
    branch: { select: { id: true, name: true, timezone: true } },
    assignedTo: { select: { id: true, status: true, user: { select: { displayName: true } } } },
    items: { where: { organizationId: session.organizationId }, select: itemSelect, orderBy: { id: "asc" } }
  } });
}
export async function listInquiries(session: AuthContext, input: { status?: string; source?: string; branchId?: string; mine?: string; page?: string }) {
  const allowed = await scope(session);
  const status = statusSchema.safeParse(input.status), source = sourceSchema.safeParse(input.source);
  const page = /^\d{1,5}$/.test(input.page ?? "") ? Math.max(1, Math.min(Number(input.page), 10000)) : 1;
  const rows = await db.inquiry.findMany({ where: { AND: [allowed,
    { status: status.success ? status.data : input.status === "ALL" ? undefined : { not: "CLOSED" },
      source: source.success ? source.data : undefined,
      branchId: z.string().uuid().safeParse(input.branchId).success ? input.branchId : undefined,
      assignedMembershipId: input.mine === "yes" ? session.membershipId : undefined }
  ] }, select: { id: true, subject: true, source: true, status: true, nextAction: true, nextActionAt: true, createdAt: true,
    branch: { select: { name: true, timezone: true } }, assignedTo: { select: { user: { select: { displayName: true } } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 51 });
  return { rows: rows.slice(0, 50), more: rows.length > 50, page };
}
function workerPermissions(member: { role: AuthContext["role"]; permissionOverrides: { permissionKey: string; effect: string }[] }) {
  return (["LEAD_VIEW", "LEAD_EDIT"] as const).every(key => {
    if (member.role === "OWNER") return true;
    const override = member.permissionOverrides.find(row => row.permissionKey === key);
    return override ? override.effect === "ALLOW" : defaultHasPermission(member.role, key);
  });
}
export async function inquiryBranches(session: AuthContext) {
  const allowed = await scope(session);
  return db.branch.findMany({ where: { organizationId: session.organizationId, status: "ACTIVE", id: allowed.branchId },
    select: { id: true, name: true, timezone: true }, orderBy: { name: "asc" } });
}
export async function inquiryOptions(session: AuthContext, requestedBranch?: string, search = "", includeVariants = true) {
  const allowed = await scope(session);
  await db.inquiry.findFirst({ where: allowed, select: { id: true } });
  const branches = await inquiryBranches(session);
  const branch = requestedBranch ? branches.find(row => row.id === requestedBranch)
    : branches.find(row => row.id === session.defaultBranchId) ?? branches[0];
  if (!branch) return { branches, branch: null, assignees: [], variants: [] };
  const canAssign = await hasPermission(session, "LEAD_ASSIGN"), canSearch = await hasPermission(session, "CATALOG_VIEW");
  const members = canAssign ? await db.organizationMembership.findMany({ where: {
    organizationId: session.organizationId, status: "ACTIVE", user: { status: "ACTIVE" },
    OR: [{ role: "OWNER" }, { branchAccess: { some: { organizationId: session.organizationId, branchId: branch.id } } }]
  }, select: { id: true, role: true, permissionOverrides: { select: { permissionKey: true, effect: true } }, user: { select: { displayName: true } } },
  orderBy: { user: { displayName: "asc" } } }) : [];
  const q = search.trim().slice(0, 100);
  const variants = canSearch && includeVariants ? await db.productVariant.findMany({ where: {
    organizationId: session.organizationId, isActive: true,
    product: { organizationId: session.organizationId, publicationStatus: "ACTIVE", archivedAt: null },
    ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" as const } }, { product: { name: { contains: q, mode: "insensitive" as const } } }] } : {})
  }, select: { id: true, sku: true, product: { select: { name: true } }, execution: { select: { name: true } }, size: { select: { name: true, code: true } } },
  orderBy: [{ product: { name: "asc" } }, { sku: "asc" }], take: 50 }) : [];
  return { branches, branch, assignees: members.filter(workerPermissions).map(m => ({ id: m.id, name: m.user.displayName })),
    variants: variants.map(v => ({ id: v.id, label: `${v.product.name}${v.execution ? ` · ${v.execution.name}` : ""} · ${v.size.name || v.size.code} · ${v.sku}` })) };
}
function dates(input: InquiryFields, timezone: string) {
  if (Boolean(input.requestedFrom) !== Boolean(input.requestedUntil)) throw new InquiryError("Укажите обе даты периода или оставьте обе пустыми.");
  if (input.nextActionAt && !input.nextAction) throw new InquiryError("Для срока укажите следующее действие.");
  try {
    const requestedFrom = input.requestedFrom ? parseBusinessLocalDateTime(input.requestedFrom, timezone) : null;
    const requestedUntil = input.requestedUntil ? parseBusinessLocalDateTime(input.requestedUntil, timezone) : null;
    if (requestedFrom && requestedUntil && requestedFrom >= requestedUntil) throw new InquiryError("Конец периода должен быть позже начала.");
    return { requestedFrom, requestedUntil, nextActionAt: input.nextActionAt ? parseBusinessLocalDateTime(input.nextActionAt, timezone) : null };
  } catch (error) {
    if (error instanceof InquiryError) throw error;
    throw new InquiryError("Проверьте даты и время филиала.");
  }
}
function textFields(input: InquiryFields) {
  return { subject: input.subject, customerLabel: input.customerLabel || null, requestText: input.requestText || null,
    requestedSize: input.requestedSize || null, nextAction: input.nextAction || null };
}
async function validateAssignee(tx: Prisma.TransactionClient, session: AuthContext, branchId: string, id: string) {
  if (!id) return;
  const member = await tx.organizationMembership.findFirst({ where: { id, organizationId: session.organizationId,
    status: "ACTIVE", user: { status: "ACTIVE" }, OR: [{ role: "OWNER" }, { branchAccess: { some: { organizationId: session.organizationId, branchId } } }] },
    select: { role: true, permissionOverrides: { select: { permissionKey: true, effect: true } } } });
  if (!member || !workerPermissions(member)) throw new InquiryError("Ответственный должен иметь доступ к обращениям этого филиала.");
}

export async function createInquiry(session: AuthContext, raw: unknown) {
  await scope(session, "LEAD_CREATE");
  const parsed = createInquiryInput.safeParse(raw);
  if (!parsed.success) throw new InquiryError("Проверьте обязательные поля и ограничения длины; можно выбрать до 20 вариантов.");
  const input = parsed.data, tenant = createTenantContext(session.organizationId);
  await requireBranchAccess(tenant, session.membershipId, input.branchId);
  if (input.assignedMembershipId) await requirePermission(session, "LEAD_ASSIGN");
  if (input.variantIds.length) await requirePermission(session, "CATALOG_VIEW");
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const replay = async () => {
    const saved = await db.inquiry.findUnique({ where: { organizationId_creationKey: { organizationId: session.organizationId, creationKey: input.creationKey } }, select: { id: true, creationHash: true, createdByUserId: true } });
    if (saved && (saved.creationHash !== hash || saved.createdByUserId !== session.userId)) throw new InquiryError("Повторный запрос отличается от исходного. Обновите форму.");
    return saved?.id;
  };
  const savedId = await replay();
  if (savedId) return savedId;
  try {
    return await db.$transaction(async tx => {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: session.organizationId, status: "ACTIVE" }, select: { timezone: true } });
      if (!branch) throw new InquiryError("Филиал недоступен.");
      await validateAssignee(tx, session, input.branchId, input.assignedMembershipId);
      const variants = await tx.productVariant.findMany({ where: { id: { in: input.variantIds }, organizationId: session.organizationId,
        isActive: true, product: { organizationId: session.organizationId, publicationStatus: "ACTIVE", archivedAt: null } },
        select: { id: true, sku: true, product: { select: { name: true } }, execution: { select: { name: true } }, size: { select: { name: true, code: true } } } });
      if (variants.length !== input.variantIds.length) throw new InquiryError("Один из выбранных вариантов недоступен. Обновите каталог.");
      const inquiry = await tx.inquiry.create({ data: {
        organizationId: session.organizationId, branchId: input.branchId, source: input.source,
        ...textFields(input), ...dates(input, branch.timezone), assignedMembershipId: input.assignedMembershipId || null,
        createdByUserId: session.userId, creationKey: input.creationKey, creationHash: hash,
        items: { create: variants.map(v => ({ organizationId: session.organizationId, productVariantId: v.id,
          nameSnapshot: `${v.product.name}${v.execution ? ` · ${v.execution.name}` : ""}`, skuSnapshot: v.sku, sizeSnapshot: v.size.name || v.size.code })) }
      }, select: { id: true } });
      await appendAuditLog(tx, { organizationId: session.organizationId, branchId: input.branchId, actorUserId: session.userId,
        actorMembershipId: session.membershipId, action: "INQUIRY_CREATED", entityType: "Inquiry", entityId: inquiry.id,
        metadata: { sourceType: input.source, itemCount: variants.length } });
      return inquiry.id;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const id = await replay(); if (id) return id;
    }
    throw error;
  }
}

export async function updateInquiry(session: AuthContext, raw: unknown) {
  const allowed = await scope(session, "LEAD_EDIT");
  const parsed = updateInquiryInput.safeParse(raw);
  if (!parsed.success) throw new InquiryError("Проверьте поля обращения и длину текста.");
  const input = parsed.data;
  return db.$transaction(async tx => {
    const inquiry = await tx.inquiry.findFirst({ where: { ...allowed, id: input.id }, include: { branch: { select: { timezone: true } } } });
    if (!inquiry) throw new InquiryError("Обращение недоступно.");
    if (inquiry.version !== input.version) throw new InquiryError("Обращение уже изменено. Обновите страницу перед сохранением.");
    const assignee = input.assignedMembershipId || null;
    if (assignee !== inquiry.assignedMembershipId) {
      await requirePermission(session, "LEAD_ASSIGN");
      await validateAssignee(tx, session, inquiry.branchId, input.assignedMembershipId);
    }
    if (inquiry.status !== input.status && (input.status === "CLOSED" || inquiry.status === "CLOSED")) await requirePermission(session, "LEAD_CLOSE");
    const changed = await tx.inquiry.updateMany({ where: { ...allowed, id: input.id, version: input.version }, data: {
      ...textFields(input), ...dates(input, inquiry.branch.timezone), assignedMembershipId: assignee, status: input.status,
      closedAt: input.status === "CLOSED" ? inquiry.closedAt ?? new Date() : null, version: { increment: 1 }
    } });
    if (changed.count !== 1) throw new InquiryError("Обращение уже изменено. Обновите страницу перед сохранением.");
    await appendAuditLog(tx, { organizationId: session.organizationId, branchId: inquiry.branchId, actorUserId: session.userId,
      actorMembershipId: session.membershipId, action: "INQUIRY_UPDATED", entityType: "Inquiry", entityId: inquiry.id,
      metadata: { status: input.status } });
    return inquiry.id;
  });
}
