"use server";

import { redirect } from "next/navigation";
import { getCurrentSession, setAuthSessionCookie } from "@/lib/auth/session";
import { rotateOrganizationSession } from "@/lib/auth/organizations";

export async function switchOrganizationAction(formData: FormData) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const targetMembershipId = formData.get("membershipId");
  if (typeof targetMembershipId !== "string" || !targetMembershipId) throw new Error("Организация недоступна.");
  const rotated = await rotateOrganizationSession({ currentSessionId: session.sessionId, userId: session.userId, targetMembershipId });
  await setAuthSessionCookie(rotated.token, rotated.expiresAt);
  redirect("/");
}
