import "server-only";
import { memberHasPermission, permissionMemberSelect } from "./member";
import { cache } from "react";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { PERMISSION_REGISTRY, type PermissionKey } from "@/lib/permissions/registry";

type PermissionContext = Pick<AuthContext, "organizationId" | "membershipId" | "role">;
export class PermissionError extends Error {
  constructor(message = "Недостаточно прав для выполнения операции.") { super(message); this.name = "PermissionError"; }
}

// One membership read per request, shared by AppShell and page checks.
const permissionsForMembership = cache(async (organizationId: string, membershipId: string) => {
  const membership = await db.organizationMembership.findFirst({
    where: { id: membershipId, organizationId, status: "ACTIVE", user: { status: "ACTIVE" } },
    select: permissionMemberSelect
  });
  if (!membership) return new Set<PermissionKey>();
  return new Set((Object.keys(PERMISSION_REGISTRY) as PermissionKey[]).filter(key => memberHasPermission(membership, key)));
});

export async function getEffectivePermissions(context: PermissionContext) {
  return permissionsForMembership(context.organizationId, context.membershipId);
}
export async function hasPermission(context: PermissionContext, key: PermissionKey) {
  return (await getEffectivePermissions(context)).has(key);
}
export async function requirePermission(context: PermissionContext, key: PermissionKey) {
  if (!await hasPermission(context, key)) throw new PermissionError();
}
