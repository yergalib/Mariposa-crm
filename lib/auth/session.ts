import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canAccessRoute, type AppRole } from "@/lib/auth/access";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth/constants";

export type AuthContext = {
  sessionId: string;
  userId: string;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  role: AppRole;
  defaultBranchId: string | null;
  defaultBranchName: string | null;
  displayName: string;
  email: string;
  expiresAt: Date;
};

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
    priority: "high" as const
  };
}

export async function createAuthSession(input: {
  userId: string;
  membershipId: string;
  organizationId: string;
}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await db.$transaction([
    db.authSession.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        membershipId: input.membershipId,
        tokenHash,
        expiresAt
      }
    }),
    db.user.update({
      where: { id: input.userId },
      data: { lastLoginAt: new Date() }
    })
  ]);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
}

export const getCurrentSession = cache(async (): Promise<AuthContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await db.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      organization: { select: { name: true, status: true } },
      user: { select: { displayName: true, email: true, status: true } },
      membership: {
        include: { defaultBranch: { select: { name: true, status: true } } }
      }
    }
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.user.status !== "ACTIVE" ||
    session.organization.status !== "ACTIVE" ||
    session.membership.status !== "ACTIVE" ||
    session.membership.userId !== session.userId ||
    session.membership.organizationId !== session.organizationId
  ) {
    return null;
  }

  return {
    sessionId: session.id,
    userId: session.userId,
    membershipId: session.membershipId,
    organizationId: session.organizationId,
    organizationName: session.organization.name,
    role: session.membership.role,
    defaultBranchId: session.membership.defaultBranchId,
    defaultBranchName: session.membership.defaultBranch?.name ?? null,
    displayName: session.user.displayName,
    email: session.user.email,
    expiresAt: session.expiresAt
  };
});

export async function requireRouteAccess(pathname: string) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!canAccessRoute(session.role, pathname)) redirect("/");
  return session;
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await db.authSession.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(new Date(0)),
    maxAge: 0
  });
}
