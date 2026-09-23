import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { hashSessionToken } from "@/lib/auth/session-token";
import { SESSION_TTL_SECONDS } from "@/lib/auth/constants";

export class OrganizationSwitchError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code === "UNAUTHENTICATED" ? "Требуется войти в систему." : "Организация недоступна.");
  }
}

export type AvailableOrganization = {
  organizationId: string;
  organizationName: string;
  membershipId: string;
  role: AuthContext["role"];
  isCurrent: boolean;
};

export async function getAvailableOrganizations(
  session: Pick<AuthContext, "userId" | "membershipId">
): Promise<AvailableOrganization[]> {
  const memberships = await db.organizationMembership.findMany({
    where: { userId: session.userId, status: "ACTIVE", organization: { status: "ACTIVE" } },
    select: { id: true, organizationId: true, role: true, organization: { select: { name: true } } },
    orderBy: [{ organization: { name: "asc" } }, { id: "asc" }]
  });

  return memberships.map((membership) => ({
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    membershipId: membership.id,
    role: membership.role,
    isCurrent: membership.id === session.membershipId
  }));
}

type RotationInput = { currentSessionId: string; userId: string; targetMembershipId: string };

export async function rotateOrganizationSession(input: RotationInput) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  const next = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`auth-switch:${input.userId}`}, 0))`;
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${input.currentSessionId}::uuid FOR UPDATE`;
    const current = await tx.authSession.findFirst({
      where: { id: input.currentSessionId, userId: input.userId, revokedAt: null, expiresAt: { gt: new Date() }, user: { status: "ACTIVE" }, membership: { status: "ACTIVE" }, organization: { status: "ACTIVE" } },
      select: { id: true }
    });
    if (!current) throw new OrganizationSwitchError("UNAUTHENTICATED");

    const target = await tx.organizationMembership.findFirst({
      where: { id: input.targetMembershipId, userId: input.userId, status: "ACTIVE", user: { status: "ACTIVE" }, organization: { status: "ACTIVE" } },
      select: { id: true, organizationId: true }
    });
    if (!target) throw new OrganizationSwitchError("FORBIDDEN");

    const revoked = await tx.authSession.updateMany({ where: { id: current.id, userId: input.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (revoked.count !== 1) throw new OrganizationSwitchError("UNAUTHENTICATED");
    return tx.authSession.create({
      data: { organizationId: target.organizationId, userId: input.userId, membershipId: target.id, tokenHash, expiresAt },
      select: { id: true, organizationId: true, membershipId: true }
    });
  });

  return { ...next, token, expiresAt };
}
