import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { workflowScope } from "@/lib/workflow-access";
import { appendAuditLog } from "@/lib/audit/log";
const name = z.string().trim().min(1).max(100);
const optional = z.string().trim().max(300);
export const documentSettingsInput = z.object({ branchId: z.string().uuid(), organizationName: name, branchName: name, address: optional, phone: optional, revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export function documentSettingsRevision(value: { organizationName: string; branchName: string; address: string; phone: string }) { return createHash("sha256").update(JSON.stringify([value.organizationName, value.branchName, value.address, value.phone])).digest("hex"); }
export async function getDocumentSettings(actor: AuthContext) { return db.$transaction(async tx => {
  const access = await workflowScope(tx, actor, ["SETTINGS_VIEW"]);
  if (access.member.role !== "OWNER") throw Error("Настройки документов доступны владельцу.");
  const organization = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true } });
  const branches = await tx.branch.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE" }, select: { id: true, name: true, address: true, phone: true, timezone: true }, orderBy: { name: "asc" } });
  return branches.map(branch => { const fields = { organizationName: organization.name, branchName: branch.name, address: branch.address ?? "", phone: branch.phone ?? "" }; return { ...fields, branchId: branch.id, timezone: branch.timezone, revision: documentSettingsRevision(fields) }; });
}); }
export async function saveDocumentSettings(actor: AuthContext, raw: unknown) {
  const input = documentSettingsInput.parse(raw);
  return db.$transaction(async tx => {
    const access = await workflowScope(tx, actor, ["SETTINGS_MANAGE"], input.branchId);
    if (access.member.role !== "OWNER") throw Error("Настройки документов доступны владельцу.");
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true } });
    const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: actor.organizationId, status: "ACTIVE" }, select: { name: true, address: true, phone: true } });
    if (!branch) throw Error("Филиал недоступен.");
    if (input.revision !== documentSettingsRevision({ organizationName: organization.name, branchName: branch.name, address: branch.address ?? "", phone: branch.phone ?? "" })) throw Error("Реквизиты уже изменены. Обновите страницу перед сохранением.");
    await tx.organization.update({ where: { id: actor.organizationId }, data: { name: input.organizationName } });
    await tx.branch.update({ where: { id: input.branchId }, data: { name: input.branchName, address: input.address || null, phone: input.phone || null } });
    await appendAuditLog(tx, { organizationId: actor.organizationId, branchId: input.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "BUSINESS_SETTING_CHANGED", entityType: "branch", entityId: input.branchId, metadata: { settingKey: "documentIdentity", detailsChanged: true } });
  }, { isolationLevel: "Serializable" });
}
