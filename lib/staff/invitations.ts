import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { MembershipRole } from "@/generated/prisma/client";
import type { TenantContext } from "@/lib/tenant/context";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { validatePassword } from "@/lib/staff/password";
import { StaffError } from "@/lib/staff/errors";
import { staffDelegation } from "@/lib/staff/delegation";
import { requirePermission } from "@/lib/permissions/effective";
import type { StaffActor } from "@/lib/staff/management";

const TTL = 48 * 60 * 60 * 1000;
const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export async function createStaffInvitation(tenant: TenantContext, input: { email: string; firstName?: string; lastName?: string; role: MembershipRole; branchIds: string[]; defaultBranchId: string | null }, actor: StaffActor) {
  await requirePermission({ organizationId: tenant.organizationId, ...actor }, "STAFF_INVITE");
  const email = normalizeEmail(input.email), ids = [...new Set(input.branchIds)], now = new Date();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new StaffError("INVALID", "Некорректный email.");
  if (input.role !== "OWNER" && !ids.length) throw new StaffError("INVALID", "Выберите филиал.");
  if (input.role !== "OWNER" && (!input.defaultBranchId || !ids.includes(input.defaultBranchId))) throw new StaffError("INVALID", "Основной филиал должен быть разрешён.");
  const token = randomBytes(32).toString("base64url"), tokenHash = hashToken(token), expiresAt = new Date(now.getTime() + TTL);
  const invitation = await db.$transaction(async (tx) => {
    await staffDelegation(tx,{...actor,organizationId:tenant.organizationId},"STAFF_INVITE",{role:input.role,branchIds:ids});
    const branches = await tx.branch.findMany({ where: { organizationId: tenant.organizationId, id: { in: ids }, status: "ACTIVE" }, select: { id: true } });
    if (branches.length !== ids.length) throw new StaffError("NOT_FOUND", "Филиал не найден.");
    const user = await tx.user.findUnique({ where: { email } });
    if (user && await tx.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId: tenant.organizationId, userId: user.id } } })) throw new StaffError("CONFLICT", "Сотрудник уже состоит в организации.");
    if (await tx.staffInvitation.findFirst({ where: { organizationId: tenant.organizationId, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } })) throw new StaffError("CONFLICT", "Для email уже существует активное приглашение.");
    const row = await tx.staffInvitation.create({ data: { organizationId: tenant.organizationId, email, firstName: input.firstName?.trim() || null, lastName: input.lastName?.trim() || null, role: input.role, tokenHash, defaultBranchId: input.defaultBranchId, invitedByUserId: actor.userId, expiresAt } });
    if (ids.length) await tx.staffInvitationBranch.createMany({ data: ids.map((branchId) => ({ organizationId: tenant.organizationId, invitationId: row.id, branchId })) });
    return row;
  });
  return { invitationId: invitation.id, token, expiresAt };
}

export async function getInvitation(raw: string) {
  const row = await db.staffInvitation.findUnique({ where: { tokenHash: hashToken(raw) }, select: { id: true, organizationId: true, email: true, firstName: true, lastName: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, organization: { select: { name: true } }, branches: { select: { branch: { select: { name: true } } } } } });
  if (!row || row.acceptedAt || row.revokedAt) throw new StaffError("NOT_FOUND", "Приглашение недействительно.");
  if (row.expiresAt <= new Date()) throw new StaffError("EXPIRED", "Срок приглашения истёк.");
  return { ...row, existingUser: Boolean(await db.user.findUnique({ where: { email: row.email }, select: { id: true } })) };
}

export async function acceptStaffInvitation(raw: string, input: { password: string; existingUserId?: string }) {
  const tokenHash = hashToken(raw);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"invite:" + tokenHash},0))`;
    const invite = await tx.staffInvitation.findUnique({ where: { tokenHash }, include: { branches: true } });
    if (!invite || invite.acceptedAt || invite.revokedAt) throw new StaffError("NOT_FOUND", "Приглашение недействительно.");
    if (invite.expiresAt <= new Date()) throw new StaffError("EXPIRED", "Срок приглашения истёк.");
    const inviter=await tx.organizationMembership.findFirst({where:{organizationId:invite.organizationId,userId:invite.invitedByUserId,status:"ACTIVE"},select:{id:true}});
    if(!inviter)throw new StaffError("FORBIDDEN","Приглашение требует повторного подтверждения уполномоченным сотрудником.");
    await staffDelegation(tx,{organizationId:invite.organizationId,membershipId:inviter.id,userId:invite.invitedByUserId},"STAFF_INVITE",{role:invite.role,branchIds:invite.branches.map(row=>row.branchId)});
    const activeBranches=await tx.branch.count({where:{organizationId:invite.organizationId,id:{in:invite.branches.map(row=>row.branchId)},status:"ACTIVE"}});
    if(activeBranches!==invite.branches.length)throw new StaffError("FORBIDDEN","Филиалы приглашения изменились.");
    let user = await tx.user.findUnique({ where: { email: invite.email } });
    if (user) {
      if (!input.existingUserId || input.existingUserId !== user.id || user.status !== "ACTIVE" || !await verifyPassword(user.passwordHash, input.password)) throw new StaffError("FORBIDDEN", "Войдите в существующий аккаунт и подтвердите пароль.");
    } else {
      validatePassword(input.password);
      const displayName = [invite.firstName, invite.lastName].filter(Boolean).join(" ") || invite.email;
      user = await tx.user.create({ data: { email: invite.email, firstName: invite.firstName, lastName: invite.lastName, displayName, passwordHash: await hashPassword(input.password), status: "ACTIVE" } });
    }
    const membership = await tx.organizationMembership.create({ data: { organizationId: invite.organizationId, userId: user.id, role: invite.role, status: "ACTIVE", joinedAt: new Date(), defaultBranchId: invite.defaultBranchId } });
    if (invite.role !== "OWNER" && invite.branches.length) await tx.membershipBranchAccess.createMany({ data: invite.branches.map((b) => ({ organizationId: invite.organizationId, membershipId: membership.id, branchId: b.branchId })) });
    await tx.staffInvitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), acceptedByUserId: user.id } });
    return { userId: user.id, membershipId: membership.id };
  });
}

export async function revokeInvitation(tenant: TenantContext, id: string, actor: StaffActor) {
 return db.$transaction(async tx=>{
 const row=await tx.staffInvitation.findFirst({where:{id,organizationId:tenant.organizationId},include:{branches:true}});
 if(!row||row.acceptedAt||row.revokedAt)throw new StaffError("NOT_FOUND","Ожидающее приглашение не найдено.");
 await staffDelegation(tx,{...actor,organizationId:tenant.organizationId},"STAFF_INVITE",{role:row.role,branchIds:row.branches.map(x=>x.branchId)});
 return tx.staffInvitation.update({where:{id},data:{revokedAt:new Date()}});
 });
}

export async function renewStaffInvitation(tenant: TenantContext, id: string, actor: StaffActor) {
  await requirePermission({ organizationId: tenant.organizationId, ...actor }, "STAFF_INVITE");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"staff-invite:" + id},0))`;
    const row = await tx.staffInvitation.findFirst({ where: { id, organizationId: tenant.organizationId }, include:{branches:true} });
    if (!row || row.acceptedAt || row.revokedAt) throw new StaffError("NOT_FOUND", "Ожидающее приглашение не найдено.");
    await staffDelegation(tx,{...actor,organizationId:tenant.organizationId},"STAFF_INVITE",{role:row.role,branchIds:row.branches.map(x=>x.branchId)});
    await tx.staffInvitation.update({ where: { id }, data: { tokenHash: hashToken(token), expiresAt, invitedByUserId: actor.userId } });
  });
  return token;
}
