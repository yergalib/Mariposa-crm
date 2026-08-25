"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createAuthSession, revokeCurrentSession } from "@/lib/auth/session";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/auth/password";

export type LoginState = { error: string | null };

const INVALID_CREDENTIALS = "Неверный email или пароль.";

export async function loginAction(
  _previousState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");

  if (typeof rawEmail !== "string" || typeof rawPassword !== "string") {
    return { error: INVALID_CREDENTIALS };
  }

  const email = rawEmail.trim().toLowerCase();
  const password = rawPassword;

  if (
    email.length < 3 ||
    email.length > 254 ||
    !email.includes("@") ||
    password.length < 1 ||
    password.length > 1024
  ) {
    return { error: INVALID_CREDENTIALS };
  }

  const user = await db.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: {
          status: "ACTIVE",
          organization: { status: "ACTIVE" }
        },
        orderBy: { createdAt: "asc" },
        take: 1
      }
    }
  });

  const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const passwordIsValid = await verifyPassword(passwordHash, password);
  const membership = user?.memberships[0];

  if (!user || user.status !== "ACTIVE" || !passwordIsValid || !membership) {
    return { error: INVALID_CREDENTIALS };
  }

  await createAuthSession({
    userId: user.id,
    membershipId: membership.id,
    organizationId: membership.organizationId
  });

  redirect("/");
}

export async function logoutAction() {
  await revokeCurrentSession();
  redirect("/login");
}
