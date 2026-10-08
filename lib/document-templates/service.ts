import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { workflowScope, permits, type WorkflowActor } from "@/lib/workflow-access";
import { appendAuditLog } from "@/lib/audit/log";
import { createTemplateInput, transitionTemplateInput, templateContentHash, validateTemplateBody, type TemplateKind } from "./contract";

async function scope(tx: Prisma.TransactionClient, actor: WorkflowActor, key: "DOCUMENT_TEMPLATE_VIEW" | "DOCUMENT_TEMPLATE_MANAGE" | "DOCUMENT_TEMPLATE_APPROVE", branchId?: string | null) {
  const access = await workflowScope(tx, actor, ["DOCUMENT_TEMPLATE_VIEW", key], branchId ?? undefined);
  if (!await tx.organization.findFirst({ where: { id: actor.organizationId, status: "ACTIVE" }, select: { id: true } })) throw Error("Организация недоступна.");
  if (branchId === null && key !== "DOCUMENT_TEMPLATE_VIEW" && !permits(access.member, "SETTINGS_GLOBAL_MANAGE")) throw Error("Для общего шаблона требуется право общих настроек.");
  return access;
}
const visible = (actor: WorkflowActor, access: Awaited<ReturnType<typeof scope>>) => ({
  organizationId: actor.organizationId,
  OR: [{ branchId: null }, { ...access.where, branch: { organizationId: actor.organizationId, status: "ACTIVE" as const } }],
});
async function serialized<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(run, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 2) continue; throw error; }
  }
}
export async function listTextTemplates(actor: WorkflowActor) {
  return db.$transaction(async tx => {
    const access = await scope(tx, actor, "DOCUMENT_TEMPLATE_VIEW");
    const branches = await tx.branch.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE", id: access.where.branchId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    const versions = await tx.crmTextTemplateVersion.findMany({ where: visible(actor, access), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
    const groups = await tx.crmTextTemplateVersion.groupBy({ by: ["branchId", "kind"], where: visible(actor, access), _max: { version: true } });
    const latest = groups.map(row => ({ branchId: row.branchId, kind: row.kind, version: row._max.version! }));
    return { branches, versions, latest, canManage: permits(access.member, "DOCUMENT_TEMPLATE_MANAGE"), canApprove: permits(access.member, "DOCUMENT_TEMPLATE_APPROVE"), canManageGlobal: permits(access.member, "SETTINGS_GLOBAL_MANAGE") };
  });
}
export async function createTextTemplate(actor: WorkflowActor, raw: unknown) {
  const input = createTemplateInput.parse(raw);
  validateTemplateBody(input.kind, input.body);
  const contentHash = templateContentHash(input.kind, input.body);
  return serialized(async tx => {
    await scope(tx, actor, "DOCUMENT_TEMPLATE_MANAGE", input.branchId);
    const where = { organizationId: actor.organizationId, branchId: input.branchId, kind: input.kind };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId + ":template:" + (input.branchId ?? "global") + ":" + input.kind}, 0))`;
    const prior = await tx.crmTextTemplateVersion.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: input.idempotencyKey } } });
    if (prior) {
      if (prior.createdByUserId !== actor.userId || prior.branchId !== input.branchId || prior.kind !== input.kind || prior.contentHash !== contentHash || prior.version !== input.baseVersion + 1) throw Error("Ключ запроса уже использован для другого текста.");
      return prior.id;
    }
    const latest = await tx.crmTextTemplateVersion.findFirst({ where, orderBy: { version: "desc" } });
    if ((latest?.version ?? 0) !== input.baseVersion) throw Error("Уже создана новая версия. Обновите список.");
    const row = await tx.crmTextTemplateVersion.create({ data: { ...where, body: input.body, contentHash, rendererVersion: 1, version: input.baseVersion + 1, idempotencyKey: input.idempotencyKey, createdByUserId: actor.userId } });
    await appendAuditLog(tx, { organizationId: actor.organizationId, branchId: input.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "TEXT_TEMPLATE_DRAFT_CREATED", entityType: "CrmTextTemplateVersion", entityId: row.id, metadata: { kind: row.kind, version: row.version, status: row.state } });
    return row.id;
  });
}
export async function transitionTextTemplate(actor: WorkflowActor, raw: unknown, action: "APPROVE" | "ARCHIVE") {
  const input = transitionTemplateInput.parse(raw);
  return serialized(async tx => {
    const access = await scope(tx, actor, action === "APPROVE" ? "DOCUMENT_TEMPLATE_APPROVE" : "DOCUMENT_TEMPLATE_MANAGE");
    const row = await tx.crmTextTemplateVersion.findFirst({ where: { ...visible(actor, access), id: input.id } });
    if (!row) throw Error("Версия недоступна.");
    await scope(tx, actor, action === "APPROVE" ? "DOCUMENT_TEMPLATE_APPROVE" : "DOCUMENT_TEMPLATE_MANAGE", row.branchId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId + ":template:" + (row.branchId ?? "global") + ":" + row.kind}, 0))`;
    if (row.contentHash !== input.contentHash || templateContentHash(row.kind as TemplateKind, row.body) !== row.contentHash) throw Error("Не удалось проверить текст версии.");
    const target = action === "APPROVE" ? "APPROVED" : "ARCHIVED";
    if (row.state === target) return row.id;
    if (row.state === "ARCHIVED" || action === "APPROVE" && row.state !== "DRAFT") throw Error("Для изменения создайте новую версию.");
    if (action === "APPROVE") {
      validateTemplateBody(row.kind as TemplateKind, row.body);
      const latest = await tx.crmTextTemplateVersion.findFirst({ where: { organizationId: actor.organizationId, branchId: row.branchId, kind: row.kind }, orderBy: { version: "desc" } });
      if (latest?.id !== row.id) throw Error("Утверждать можно только последнюю версию. Обновите список.");
      const previous = await tx.crmTextTemplateVersion.findMany({ where: { organizationId: actor.organizationId, branchId: row.branchId, kind: row.kind, state: "APPROVED" } });
      for (const old of previous) {
        await tx.crmTextTemplateVersion.update({ where: { id: old.id }, data: { state: "ARCHIVED", archivedAt: new Date(), archivedByUserId: actor.userId } });
        await appendAuditLog(tx, { organizationId: actor.organizationId, branchId: row.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "TEXT_TEMPLATE_ARCHIVED", entityType: "CrmTextTemplateVersion", entityId: old.id, metadata: { kind: old.kind, version: old.version, status: "ARCHIVED" } });
      }
    }
    await tx.crmTextTemplateVersion.update({ where: { id: row.id }, data: action === "APPROVE" ? { state: target, approvedAt: new Date(), approvedByUserId: actor.userId } : { state: target, archivedAt: new Date(), archivedByUserId: actor.userId } });
    await appendAuditLog(tx, { organizationId: actor.organizationId, branchId: row.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: action === "APPROVE" ? "TEXT_TEMPLATE_APPROVED" : "TEXT_TEMPLATE_ARCHIVED", entityType: "CrmTextTemplateVersion", entityId: row.id, metadata: { kind: row.kind, version: row.version, status: target } });
    return row.id;
  });
}

// Used by existing order snapshot save after its own fresh tenant/branch authorization.
export async function approvedRentalText(tx: Prisma.TransactionClient, organizationId: string, branchId: string) {
  const candidates = await tx.crmTextTemplateVersion.findMany({ where: { organizationId, kind: "RENTAL_NOTE", state: "APPROVED", OR: [{ branchId }, { branchId: null }] }, orderBy: { version: "desc" } });
  const row = candidates.find(item => item.branchId === branchId) ?? candidates.find(item => item.branchId === null);
  if (row && (row.rendererVersion !== 1 || templateContentHash("RENTAL_NOTE", row.body) !== row.contentHash)) throw Error("Не удалось проверить информационный текст.");
  return row ?? null;
}
